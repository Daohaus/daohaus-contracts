pragma solidity ^0.4.15;

import "./ResourceProposal.sol";
import "./Owned.sol";

contract Hub is Owned {

  address[] public members;
  uint public availableBalance;
  uint public runningBalance;
  uint public pvr;

  address[] public proposals;
  mapping(address => bool) proposalExists;
  mapping(address => bytes8) memberNumbers;
  mapping(address => uint) amountsPledgedMapping;
  mapping(address => bool) finishedProposals;
  mapping(address => uint) balances;

  modifier onlyIfProposal(address proposal) {
    require(proposalExists[proposal]);
    _;
  }

  modifier onlyIfMember() {
    require (amountsPledgedMapping[msg.sender] > 0);
    _;
  }

  event LogMemberRegistered(address member, uint ethPledge, uint _availableBalance, uint _runningBalance);
  event LogNewProposal(address chairmanAddress, uint fees, uint blocks, uint cost, bytes32 text, address proposalAddress);

  function Hub() {
    pvr = 75;
  }

  function isMember(address person)
  public
  constant
  returns (bool)
  {
   return amountsPledgedMapping[person] > 0;
  }

  function register(bytes8 phoneNumber)
    public
    payable
    sufficientFunds()
  {
    /* update hub contract balance */
    availableBalance += msg.value;
    runningBalance += msg.value;

    /* update amountsPledged mapping */
    amountsPledgedMapping[msg.sender] += msg.value;
    memberNumbers[msg.sender] = phoneNumber;

    /* update members array */
    members.push(msg.sender);

    LogMemberRegistered(
      msg.sender,
      msg.value,
      availableBalance,
      runningBalance
    );
  }

  function getMembersCount()
    constant
    public
    returns (uint count)
  {
    return members.length;
  }

  function getVotingRightRatio(address member)
    constant
    public
    returns (uint ratio)
  {
    return (amountsPledgedMapping[member] / runningBalance) * 100;
  }

  /*function propose(uint ethAmount, string proposalMessage) {
    address proposer = msg.sender;
  }*/

  modifier sufficientFunds() {
    require(msg.value > 0);
    _;
  }

   function getProposalCount()
        public
        constant
        returns(uint proposalCount)
    {
        return proposals.length;
    }

    function createResourceProposal(
      address chairmanAddress,
      uint fees,
      uint blocks,
      uint cost,
      bytes32 text
    )
        public
        //onlyIfMember
        returns(address proposalContract)
    {
      ResourceProposal trustedProposal = new ResourceProposal(
        chairmanAddress,
        fees,
        blocks,
        cost,
        text
      );
      proposals.push(trustedProposal);
      proposalExists[trustedProposal] = true;
      LogNewProposal(chairmanAddress, fees, blocks, cost, text, trustedProposal);
      return trustedProposal;
    }

    function executeProposal(address[] addrForHub, uint8[] votesForHub, address chairMan, uint totFees, uint deadline)
      public
      returns(uint8)
    {
      uint count = addrForHub.length;
      uint pos = 0;
      uint total = 0;
      for(uint i=0;i<count;i++)
      {
        if(isMember(addrForHub[i])){
          uint ratio = getVotingRightRatio(addrForHub[i]);
          if(votesForHub[i]==1) {
            pos+=ratio;
          }
          total+=ratio;
        }
      }

      uint cpvr = pos/100;
      if(cpvr>=pvr){
        finishedProposals[msg.sender] = true;
        balances[chairMan]+=totFees;
        return 1;
      }
      else if(block.number> deadline){
        finishedProposals[msg.sender] = true;
      }
      return 2;
    }

    // Pass-through Admin Controls
    function stopProposal(address proposal)
        onlyOwner()
        onlyIfProposal(proposal)
        returns(bool success)
    {
        ResourceProposal trustedProposal = ResourceProposal(proposal);
        return(trustedProposal.runSwitch(false));
    }
}
