import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import time from "./time";

import {
  GnosisSafe,
  GnosisSafeProxyFactory,
  LinearERC721Voting,
  LinearERC721Voting__factory,
  Azorius,
  Azorius__factory,
  ModuleProxyFactory,
  MockERC721,
  MockERC721__factory,
} from "../typechain-types";

import {
  buildSignatureBytes,
  buildSafeTransaction,
  safeSignTypedData,
  ifaceSafe,
  predictGnosisSafeAddress,
  calculateProxyAddress,
  mockTransaction,
} from "./helpers";

describe("Safe with Azorius module and linearERC721Voting", () => {
  const abiCoder = new ethers.utils.AbiCoder();

  // Deployed contracts
  let gnosisSafe: GnosisSafe;
  let azorius: Azorius;
  let azoriusMastercopy: Azorius;
  let linearERC721Voting: LinearERC721Voting;
  let linearERC721VotingMastercopy: LinearERC721Voting;
  let mockNFT1: MockERC721;
  let mockNFT2: MockERC721;
  let gnosisSafeProxyFactory: GnosisSafeProxyFactory;
  let moduleProxyFactory: ModuleProxyFactory;

  // Wallets
  let deployer: SignerWithAddress;
  let gnosisSafeOwner: SignerWithAddress;
  let tokenHolder1: SignerWithAddress;
  let tokenHolder2: SignerWithAddress;
  let tokenHolder3: SignerWithAddress;
  let holder1Tokens: string[];
  let holder2Tokens: string[];
  let holder3Tokens: string[];
  let holder1Ids: number[];
  let holder2Ids: number[];
  let holder3Ids: number[];

  let tokenTransferData: string;
  let proposalTransaction: any;

  // Gnosis
  let createGnosisSetupCalldata: string;

  const gnosisFactoryAddress = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
  const moduleProxyFactoryAddress =
    "0x00000000000DC7F163742Eb4aBEf650037b1f588";
  const gnosisSingletonAddress = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
  const saltNum = BigNumber.from(
    "0x856d90216588f9ffc124d1480a440e1c012c7a816952bc968d737bae5d4e139c"
  );

  async function mintNFT(
    contract: MockERC721,
    receiver: SignerWithAddress
  ): Promise<void> {
    await contract.connect(receiver).mint(receiver.address);
  }

  beforeEach(async () => {
    const abiCoder = new ethers.utils.AbiCoder();

    // Fork Goerli to use contracts deployed on Goerli
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.GOERLI_PROVIDER
              ? process.env.GOERLI_PROVIDER
              : "",
          },
        },
      ],
    });

    // Get the signer accounts
    [deployer, gnosisSafeOwner, tokenHolder1, tokenHolder2, tokenHolder3] =
      await ethers.getSigners();

    // Get Gnosis Safe Proxy factory
    gnosisSafeProxyFactory = await ethers.getContractAt(
      "GnosisSafeProxyFactory",
      gnosisFactoryAddress
    );

    // Get module proxy factory
    moduleProxyFactory = await ethers.getContractAt(
      "ModuleProxyFactory",
      moduleProxyFactoryAddress
    );

    createGnosisSetupCalldata = ifaceSafe.encodeFunctionData("setup", [
      [gnosisSafeOwner.address],
      1,
      ethers.constants.AddressZero,
      ethers.constants.HashZero,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      ethers.constants.AddressZero,
    ]);

    const predictedGnosisSafeAddress = await predictGnosisSafeAddress(
      gnosisSafeProxyFactory.address,
      createGnosisSetupCalldata,
      saltNum,
      gnosisSingletonAddress,
      gnosisSafeProxyFactory
    );

    // Deploy Gnosis Safe
    await gnosisSafeProxyFactory.createProxyWithNonce(
      gnosisSingletonAddress,
      createGnosisSetupCalldata,
      saltNum
    );

    gnosisSafe = await ethers.getContractAt(
      "GnosisSafe",
      predictedGnosisSafeAddress
    );

    // Deploy Mock NFTs
    mockNFT1 = await new MockERC721__factory(deployer).deploy();
    mockNFT2 = await new MockERC721__factory(deployer).deploy();

    // dish out some NFTs

    // weight 1
    await mintNFT(mockNFT1, tokenHolder1);

    // weight 2
    await mintNFT(mockNFT2, tokenHolder2);

    // weight 3
    await mintNFT(mockNFT1, tokenHolder3);
    await mintNFT(mockNFT2, tokenHolder3);

    holder1Tokens = [mockNFT1.address];
    holder2Tokens = [mockNFT2.address];
    holder3Tokens = [mockNFT1.address, mockNFT2.address];
    holder1Ids = [0];
    holder2Ids = [0];
    holder3Ids = [1, 1];

    tokenTransferData = mockNFT1.interface.encodeFunctionData("mint", [
      deployer.address,
    ]);

    proposalTransaction = {
      to: mockNFT1.address,
      value: BigNumber.from(0),
      data: tokenTransferData,
      operation: 0,
    };

    // Deploy Azorius module
    azoriusMastercopy = await new Azorius__factory(deployer).deploy();

    const azoriusSetupCalldata =
      // eslint-disable-next-line camelcase
      Azorius__factory.createInterface().encodeFunctionData("setUp", [
        abiCoder.encode(
          ["address", "address", "address", "address[]", "uint32", "uint32"],
          [
            gnosisSafeOwner.address,
            gnosisSafe.address,
            gnosisSafe.address,
            [],
            60, // timelock period in blocks
            60, // execution period in blocks
          ]
        ),
      ]);

    await moduleProxyFactory.deployModule(
      azoriusMastercopy.address,
      azoriusSetupCalldata,
      "10031021"
    );

    const predictedAzoriusAddress = await calculateProxyAddress(
      moduleProxyFactory,
      azoriusMastercopy.address,
      azoriusSetupCalldata,
      "10031021"
    );

    azorius = await ethers.getContractAt("Azorius", predictedAzoriusAddress);

    // Deploy Linear ERC721 Voting Mastercopy
    linearERC721VotingMastercopy = await new LinearERC721Voting__factory(
      deployer
    ).deploy();

    const linearERC721VotingSetupCalldata =
      // eslint-disable-next-line camelcase
      LinearERC721Voting__factory.createInterface().encodeFunctionData(
        "setUp",
        [
          abiCoder.encode(
            [
              "address",
              "address[]",
              "uint256[]",
              "address",
              "uint32",
              "uint256",
              "uint256",
              "uint256",
            ],
            [
              gnosisSafeOwner.address, // owner
              [mockNFT1.address, mockNFT2.address], // NFT addresses
              [1, 2], // NFT weights
              azorius.address, // Azorius module
              60, // voting period in blocks
              2, // quorom threshold
              2, // proposer threshold
              500000, // basis numerator, denominator is 1,000,000, so basis percentage is 50% (simple majority)
            ]
          ),
        ]
      );

    await moduleProxyFactory.deployModule(
      linearERC721VotingMastercopy.address,
      linearERC721VotingSetupCalldata,
      "10031021" // TODO what's this number???
    );

    const predictedlinearERC721VotingAddress = calculateProxyAddress(
      moduleProxyFactory,
      linearERC721VotingMastercopy.address,
      linearERC721VotingSetupCalldata,
      "10031021"
    );

    linearERC721Voting = await ethers.getContractAt(
      "LinearERC721Voting",
      predictedlinearERC721VotingAddress
    );

    // Enable the Linear Voting strategy on Azorius
    await azorius
      .connect(gnosisSafeOwner)
      .enableStrategy(linearERC721Voting.address);

    // Create transaction on Gnosis Safe to setup Azorius module
    const enableAzoriusModuleData = gnosisSafe.interface.encodeFunctionData(
      "enableModule",
      [azorius.address]
    );

    const enableAzoriusModuleTx = buildSafeTransaction({
      to: gnosisSafe.address,
      data: enableAzoriusModuleData,
      safeTxGas: 1000000,
      nonce: (await gnosisSafe.nonce()).toNumber(),
    });

    const sigs = [
      await safeSignTypedData(
        gnosisSafeOwner,
        gnosisSafe,
        enableAzoriusModuleTx
      ),
    ];

    const signatureBytes = buildSignatureBytes(sigs);

    // Execute transaction that adds the Azorius module to the Safe
    await expect(
      gnosisSafe.execTransaction(
        enableAzoriusModuleTx.to,
        enableAzoriusModuleTx.value,
        enableAzoriusModuleTx.data,
        enableAzoriusModuleTx.operation,
        enableAzoriusModuleTx.safeTxGas,
        enableAzoriusModuleTx.baseGas,
        enableAzoriusModuleTx.gasPrice,
        enableAzoriusModuleTx.gasToken,
        enableAzoriusModuleTx.refundReceiver,
        signatureBytes
      )
    ).to.emit(gnosisSafe, "ExecutionSuccess");
  });

  // describe("Safe with Azorius module and linearERC721Voting", () => {
  //   it("Gets correctly initialized", async () => {
  //     expect(await linearERC721Voting.owner()).to.eq(gnosisSafeOwner.address);
  //     expect(await linearERC721Voting.tokenAddresses).to.eq(
  //       "[" + mockNFT1.address + ", " + mockNFT2.address + "]"
  //     );
  //     expect(await linearERC721Voting.azoriusModule()).to.eq(azorius.address);
  //     expect(await linearERC721Voting.votingPeriod()).to.eq(60);
  //     expect(await linearERC721Voting.quorumThreshold()).to.eq(2);
  //     expect(await linearERC721Voting.proposerThreshold()).to.eq(2);
  //   });

  //   it("A strategy cannot be enabled more than once", async () => {
  //     await expect(
  //       azorius
  //         .connect(gnosisSafeOwner)
  //         .enableStrategy(linearERC721Voting.address)
  //     ).to.be.revertedWith("StrategyEnabled()");
  //   });

  //   it("The owner can change the Azorius Module on the Strategy", async () => {
  //     await linearERC721Voting
  //       .connect(gnosisSafeOwner)
  //       .setAzorius(deployer.address);

  //     expect(await linearERC721Voting.azoriusModule()).to.eq(deployer.address);
  //   });

  //   it("A non-owner cannot change the Azorius Module on the Strategy", async () => {
  //     await expect(
  //       linearERC721Voting.connect(tokenHolder1).setAzorius(deployer.address)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("The owner can update the voting period", async () => {
  //     expect(await linearERC721Voting.votingPeriod()).to.eq(60);
  //     await linearERC721Voting.connect(gnosisSafeOwner).updateVotingPeriod(120);

  //     expect(await linearERC721Voting.votingPeriod()).to.eq(120);
  //   });

  //   it("A non-owner cannot update the strategy voting period", async () => {
  //     await expect(
  //       linearERC721Voting.connect(tokenHolder1).updateVotingPeriod(120)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("The owner can update the timelock period", async () => {
  //     expect(await azorius.timelockPeriod()).to.eq(60);
  //     await azorius.connect(gnosisSafeOwner).updateTimelockPeriod(120);

  //     expect(await azorius.timelockPeriod()).to.eq(120);
  //   });

  //   it("A non-owner cannot update the strategy timelock period", async () => {
  //     await expect(
  //       azorius.connect(tokenHolder1).updateTimelockPeriod(120)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Getting proposal state on an invalid proposal ID reverts", async () => {
  //     await expect(azorius.proposalState(0)).to.be.revertedWith(
  //       "InvalidProposal()"
  //     );

  //     await expect(azorius.proposalState(0)).to.be.revertedWith(
  //       "InvalidProposal()"
  //     );
  //   });

  //   it("A proposal cannot be submitted if the specified strategy has not been enabled", async () => {
  //     // Use an incorrect address for the strategy
  //     await expect(
  //       azorius
  //         .connect(tokenHolder2)
  //         .submitProposal(mockNFT1.address, "0x", [mockTransaction()], "")
  //     ).to.be.revertedWith("StrategyDisabled()");
  //   });

  //   it("Proposal cannot be received by the strategy from address other than Azorius", async () => {
  //     // Submit call from address that isn't Azorius module
  //     await expect(
  //       linearERC721Voting.initializeProposal([])
  //     ).to.be.revertedWith("OnlyAzorius()");
  //   });

  //   it("Votes cannot be cast on a proposal that hasn't been submitted yet", async () => {
  //     // User attempts to vote on proposal that has not yet been submitted
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 1, holder1Tokens, holder1Ids)
  //     ).to.be.revertedWith("InvalidProposal()");
  //   });

  //   it("Votes cannot be cast after the voting period has ended", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Increase blocks so that voting period has ended
  //     await time.advanceBlocks(60);

  //     // Users vote in support of proposal
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 1, holder1Tokens, holder1Ids)
  //     ).to.be.revertedWith("VotingEnded()");
  //   });

  //   it("A voter cannot vote more than once on a proposal", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder1Tokens, holder1Ids);
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 1, holder1Tokens, holder1Ids)
  //     ).to.be.revertedWith("AlreadyVoted()");
  //   });

  //   it("Correctly counts proposal Yes votes", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     await network.provider.send("evm_mine");

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     expect((await linearERC721Voting.getProposalVotes(0)).yesVotes).to.eq(0);

  //     // Token holder 1 votes with voting weight of 1
  //     await linearERC721Voting
  //       .connect(tokenHolder1)
  //       .vote(0, 1, holder1Tokens, holder1Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).yesVotes).to.eq(1);

  //     // Token holder 2 votes with voting weight of 2
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).yesVotes).to.eq(3);

  //     // Token holder 3 votes with voting weight of 3
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).yesVotes).to.eq(6);
  //   });

  //   it("Correctly counts proposal No votes", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     await network.provider.send("evm_mine");

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     expect((await linearERC721Voting.getProposalVotes(0)).noVotes).to.eq(0);

  //     // Token holder 1 votes with voting weight of 1
  //     await linearERC721Voting
  //       .connect(tokenHolder1)
  //       .vote(0, 0, holder1Tokens, holder1Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).noVotes).to.eq(1);

  //     // Token holder 2 votes with voting weight of 2
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 0, holder2Tokens, holder2Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).noVotes).to.eq(3);

  //     // Token holder 3 votes with voting weight of 3
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 0, holder3Tokens, holder3Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).noVotes).to.eq(6);
  //   });

  //   it("Correctly counts proposal Abstain votes", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     await network.provider.send("evm_mine");

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     expect((await linearERC721Voting.getProposalVotes(0)).abstainVotes).to.eq(
  //       0
  //     );

  //     // Token holder 1 votes with voting weight of 1
  //     await linearERC721Voting
  //       .connect(tokenHolder1)
  //       .vote(0, 2, holder1Tokens, holder1Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).abstainVotes).to.eq(
  //       1
  //     );

  //     // Token holder 2 votes with voting weight of 2
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 2, holder2Tokens, holder2Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).abstainVotes).to.eq(
  //       3
  //     );

  //     // Token holder 3 votes with voting weight of 3
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 2, holder3Tokens, holder3Ids);

  //     expect((await linearERC721Voting.getProposalVotes(0)).abstainVotes).to.eq(
  //       6
  //     );
  //   });

  //   it("A proposal is passed with enough Yes votes and quorum", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.true;

  //     // Proposal is timelocked
  //     await expect(await azorius.proposalState(0)).to.eq(1);
  //   });

  //   it("A proposal is not passed if there are more No votes than Yes votes", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // Users vote against
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 0, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 0, holder3Tokens, holder3Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // Proposal is in the failed state
  //     expect(await azorius.proposalState(0)).to.eq(5);

  //     await expect(
  //       azorius.executeProposal(
  //         0,
  //         [mockNFT1.address],
  //         [0],
  //         [tokenTransferData],
  //         [0]
  //       )
  //     ).to.be.revertedWith("ProposalNotExecutable()");
  //   });

  //   it("A proposal is not passed if quorum is not reached", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // User votes "Yes"
  //     await linearERC721Voting
  //       .connect(tokenHolder1)
  //       .vote(0, 1, holder1Tokens, holder1Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     await expect(
  //       azorius.executeProposal(
  //         0,
  //         [mockNFT1.address],
  //         [0],
  //         [tokenTransferData],
  //         [0]
  //       )
  //     ).to.be.revertedWith("ProposalNotExecutable()");

  //     // Proposal in the failed state
  //     expect(await azorius.proposalState(0)).to.eq(5);
  //   });

  //   it("A proposal is not passed if voting period is not over", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // Users vote "Yes"
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     await expect(
  //       azorius.executeProposal(
  //         0,
  //         [mockNFT1.address],
  //         [0],
  //         [tokenTransferData],
  //         [0]
  //       )
  //     ).to.be.revertedWith("ProposalNotExecutable()");

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);
  //   });

  //   it("Submitting a proposal emits the event with the associated proposal metadata", async () => {
  //     const proposalMetadata = "This is my amazing proposal!";

  //     const tx = await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         proposalMetadata
  //       );
  //     const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
  //     const data = receipt.logs[1].data;
  //     const topics = receipt.logs[1].topics;
  //     const event = azorius.interface.decodeEventLog(
  //       "ProposalCreated",
  //       data,
  //       topics
  //     );

  //     // Check that the event emits the correct values
  //     expect(event.transactions[0].to).to.be.equal(proposalTransaction.to);
  //     expect(event.transactions[0].value).to.be.equal(
  //       proposalTransaction.value
  //     );
  //     expect(event.transactions[0].data).to.be.equal(proposalTransaction.data);
  //     expect(event.transactions[0].operation).to.be.equal(
  //       proposalTransaction.operation
  //     );

  //     expect(event.metadata).to.be.equal(proposalMetadata);
  //   });

  //   it("A proposal can be created and executed", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     const txHash = await azorius.getTxHash(
  //       mockNFT1.address,
  //       BigNumber.from(0),
  //       tokenTransferData,
  //       0
  //     );

  //     const proposalTxHashes = await azorius.getProposalTxHashes(0);

  //     const proposalTxHash = await azorius.getProposalTxHash(0, 0);

  //     expect([txHash]).to.deep.eq(proposalTxHashes);

  //     expect(txHash).to.deep.eq(proposalTxHash);

  //     expect(await azorius.getProposal(0)).to.deep.eq([
  //       linearERC721Voting.address,
  //       [txHash],
  //       60,
  //       60,
  //       0,
  //     ]);

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // NFT ids haven't voted yet
  //     expect(await linearERC721Voting.hasVoted(0, mockNFT1.address, 0)).to.eq(
  //       false
  //     );
  //     expect(await linearERC721Voting.hasVoted(0, mockNFT1.address, 0)).to.eq(
  //       false
  //     );

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder1Tokens, holder1Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder2Tokens, holder2Ids);

  //     // NFT ids have voted
  //     expect(await linearERC721Voting.hasVoted(0, mockNFT1.address, 0)).to.eq(
  //       true
  //     );
  //     expect(await linearERC721Voting.hasVoted(0, mockNFT1.address, 0)).to.eq(
  //       true
  //     );

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is timelocked
  //     expect(await azorius.proposalState(0)).to.eq(1);

  //     // Increase time so that timelock period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is executable
  //     expect(await azorius.proposalState(0)).to.eq(2);

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(0);

  //     // Execute the transaction
  //     await azorius.executeProposal(
  //       0,
  //       [mockNFT1.address],
  //       [0],
  //       [tokenTransferData],
  //       [0]
  //     );

  //     expect(await azorius.getProposal(0)).to.deep.eq([
  //       linearERC721Voting.address,
  //       [txHash],
  //       60,
  //       60,
  //       1,
  //     ]);

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(1);

  //     // Proposal is in the executed state
  //     expect(await azorius.proposalState(0)).to.eq(3);
  //   });

  //   it("Multiple transactions can be executed from a single proposal", async () => {
  //     // Create transaction to mint tokens to the deployer
  //     const tokenTransferData1 = tokenTransferData;
  //     const tokenTransferData2 = tokenTransferData;
  //     const tokenTransferData3 = tokenTransferData;

  //     const proposalTransaction1 = {
  //       to: mockNFT1.address,
  //       value: BigNumber.from(0),
  //       data: tokenTransferData1,
  //       operation: 0,
  //     };

  //     const proposalTransaction2 = {
  //       to: mockNFT1.address,
  //       value: BigNumber.from(0),
  //       data: tokenTransferData2,
  //       operation: 0,
  //     };

  //     const proposalTransaction3 = {
  //       to: mockNFT1.address,
  //       value: BigNumber.from(0),
  //       data: tokenTransferData3,
  //       operation: 0,
  //     };

  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction1, proposalTransaction2, proposalTransaction3],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is timelocked
  //     expect(await azorius.proposalState(0)).to.eq(1);

  //     // Increase time so that timelock period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is executable
  //     expect(await azorius.proposalState(0)).to.eq(2);

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(0);

  //     // Execute the transaction
  //     await azorius.executeProposal(
  //       0,
  //       [mockNFT1.address, mockNFT1.address, mockNFT1.address],
  //       [0, 0, 0],
  //       [tokenTransferData1, tokenTransferData2, tokenTransferData3],
  //       [0, 0, 0]
  //     );

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(3);

  //     // Proposal is executed
  //     expect(await azorius.proposalState(0)).to.eq(3);
  //   });

  //   it("Executing a proposal reverts if the transaction cannot be executed", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder2Tokens, holder2Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is timelocked
  //     expect(await azorius.proposalState(0)).to.eq(1);

  //     // Increase time so that timelock period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is executable
  //     expect(await azorius.proposalState(0)).to.eq(2);

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(0);

  //     // Execute the transaction
  //     await expect(
  //       azorius.executeProposal(
  //         0,
  //         [mockNFT1.address],
  //         [0],
  //         [tokenTransferData],
  //         [0]
  //       )
  //     ).to.be.revertedWith("TxFailed()");

  //     // Proposal is executable
  //     expect(await azorius.proposalState(0)).to.eq(2);

  //     expect(await mockNFT1.balanceOf(deployer.address)).to.eq(1);
  //   });

  //   it("If a proposal is not executed during the execution period, it becomes expired", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [proposalTransaction],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is timelocked
  //     expect(await azorius.proposalState(0)).to.eq(1);

  //     // Increase time so that timelock period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is executable
  //     expect(await azorius.proposalState(0)).to.eq(2);

  //     // Increase time so that execution period has ended
  //     await time.advanceBlocks(60);

  //     // Proposal is expired
  //     expect(await azorius.proposalState(0)).to.eq(4);

  //     // Execute the transaction
  //     await expect(
  //       azorius.executeProposal(
  //         0,
  //         [mockNFT1.address],
  //         [0],
  //         [tokenTransferData],
  //         [0]
  //       )
  //     ).to.be.revertedWith("ProposalNotExecutable()");
  //   });

  //   it("A proposal with no transactions that passes goes immediately to executed", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(linearERC721Voting.address, "0x", [], "");

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.false;

  //     // Users vote in support of proposal
  //     await linearERC721Voting
  //       .connect(tokenHolder2)
  //       .vote(0, 1, holder2Tokens, holder2Ids);
  //     await linearERC721Voting
  //       .connect(tokenHolder3)
  //       .vote(0, 1, holder3Tokens, holder3Ids);

  //     // Increase time so that voting period has ended
  //     await time.advanceBlocks(60);

  //     await expect(await linearERC721Voting.isPassed(0)).to.be.true;

  //     // Proposal is executed
  //     await expect(await azorius.proposalState(0)).to.eq(3);
  //   });

  //   it("Only the owner can update the timelock period on Azorius", async () => {
  //     expect(await azorius.timelockPeriod()).to.eq(60);

  //     await azorius.connect(gnosisSafeOwner).updateTimelockPeriod(70);

  //     expect(await azorius.timelockPeriod()).to.eq(70);

  //     await expect(
  //       azorius.connect(tokenHolder1).updateTimelockPeriod(80)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Only the owner can update the execution period on Azorius", async () => {
  //     expect(await azorius.executionPeriod()).to.eq(60);

  //     await azorius.connect(gnosisSafeOwner).updateExecutionPeriod(100);

  //     expect(await azorius.executionPeriod()).to.eq(100);

  //     await expect(
  //       azorius.connect(tokenHolder1).updateExecutionPeriod(110)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Only the owner can update the quorum threshold on the ERC721LinearVoting", async () => {
  //     expect(await linearERC721Voting.quorumThreshold()).to.eq(1);

  //     await linearERC721Voting
  //       .connect(gnosisSafeOwner)
  //       .updateQuorumThreshold(4);

  //     expect(await linearERC721Voting.quorumThreshold()).to.eq(4);

  //     await expect(
  //       linearERC721Voting.connect(tokenHolder1).updateQuorumThreshold(5)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Only the owner can update the basis numerator on the ERC721LinearVoting", async () => {
  //     expect(await linearERC721Voting.basisNumerator()).to.eq(500000);

  //     await linearERC721Voting
  //       .connect(gnosisSafeOwner)
  //       .updateBasisNumerator(600000);

  //     expect(await linearERC721Voting.basisNumerator()).to.eq(600000);

  //     await expect(
  //       linearERC721Voting.connect(tokenHolder1).updateBasisNumerator(700000)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Basis numerator cannot be updated to a value larger than the denominator", async () => {
  //     await expect(
  //       linearERC721Voting
  //         .connect(gnosisSafeOwner)
  //         .updateBasisNumerator(1000001)
  //     ).to.be.revertedWith("InvalidBasisNumerator()");
  //   });

  //   it("Only the owner can update the proposer weight on the ERC20LinearVoting", async () => {
  //     expect(await linearERC721Voting.proposerThreshold()).to.eq(1);

  //     await linearERC721Voting
  //       .connect(gnosisSafeOwner)
  //       .updateProposerThreshold(2);

  //     expect(await linearERC721Voting.proposerThreshold()).to.eq(2);

  //     await expect(
  //       linearERC721Voting.connect(tokenHolder1).updateProposerThreshold(3)
  //     ).to.be.revertedWith("Ownable: caller is not the owner");
  //   });

  //   it("Linear ERC721 voting contract cannot be setup with an invalid governance token address", async () => {
  //     // Deploy Linear ERC721 Voting Strategy
  //     linearERC721Voting = await new LinearERC721Voting__factory(
  //       deployer
  //     ).deploy();

  //     const linearERC721VotingSetupCalldata =
  //       // eslint-disable-next-line camelcase
  //       LinearERC721Voting__factory.createInterface().encodeFunctionData(
  //         "setUp",
  //         [
  //           abiCoder.encode(
  //             [
  //               "address",
  //               "address[]",
  //               "uint256[]",
  //               "address",
  //               "uint32",
  //               "uint256",
  //               "uint256",
  //               "uint256",
  //             ],
  //             [
  //               gnosisSafeOwner.address, // owner
  //               [ethers.constants.AddressZero], // NFT addresses
  //               [1], // NFT weights
  //               azorius.address, // Azorius module
  //               60, // voting period in blocks
  //               1, // quorom threshold
  //               1, // proposer threshold
  //               500000, // basis numerator, denominator is 1,000,000, so basis percentage is 50% (simple majority)
  //             ]
  //           ),
  //         ]
  //       );

  //     await expect(
  //       moduleProxyFactory.deployModule(
  //         linearERC721VotingMastercopy.address,
  //         linearERC721VotingSetupCalldata,
  //         "10031021"
  //       )
  //     ).to.be.reverted;
  //   });

  //   it("An invalid vote type cannot be cast", async () => {
  //     await azorius
  //       .connect(tokenHolder2)
  //       .submitProposal(
  //         linearERC721Voting.address,
  //         "0x",
  //         [mockTransaction()],
  //         ""
  //       );

  //     // Proposal is active
  //     expect(await azorius.proposalState(0)).to.eq(0);

  //     // Users cast invalid vote types
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 3, holder2Tokens, holder2Ids)
  //     ).to.be.revertedWith("InvalidVote()");
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 4, holder2Tokens, holder2Ids)
  //     ).to.be.revertedWith("InvalidVote()");
  //     await expect(
  //       linearERC721Voting
  //         .connect(tokenHolder2)
  //         .vote(0, 5, holder2Tokens, holder2Ids)
  //     ).to.be.revertedWith("InvalidVote()");
  //   });

  //   it("A non-proposer can't submit a proposal", async () => {
  //     expect(await linearERC721Voting.isProposer(tokenHolder2.address)).to.eq(
  //       true
  //     );
  //     expect(await linearERC721Voting.isProposer(deployer.address)).to.eq(
  //       false
  //     );

  //     await expect(
  //       azorius
  //         .connect(deployer)
  //         .submitProposal(
  //           linearERC721Voting.address,
  //           "0x",
  //           [mockTransaction()],
  //           ""
  //         )
  //     ).to.be.revertedWith("InvalidProposer()");

  //     await linearERC721Voting
  //       .connect(gnosisSafeOwner)
  //       .updateProposerThreshold(301);

  //     expect(await linearERC721Voting.isProposer(tokenHolder2.address)).to.eq(
  //       false
  //     );
  //     expect(await linearERC721Voting.isProposer(deployer.address)).to.eq(
  //       false
  //     );

  //     await expect(
  //       azorius
  //         .connect(deployer)
  //         .submitProposal(
  //           linearERC721Voting.address,
  //           "0x",
  //           [mockTransaction()],
  //           ""
  //         )
  //     ).to.be.revertedWith("InvalidProposer()");

  //     await expect(
  //       azorius
  //         .connect(tokenHolder2)
  //         .submitProposal(
  //           linearERC721Voting.address,
  //           "0x",
  //           [mockTransaction()],
  //           ""
  //         )
  //     ).to.be.revertedWith("InvalidProposer()");
  //   });

  //   it("An proposal that hasn't been submitted yet is not passed", async () => {
  //     expect(await linearERC721Voting.isPassed(0)).to.eq(false);
  //   });
  // });
});
