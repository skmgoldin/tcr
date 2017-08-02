# AdChainRegistry

![alt text](https://github.com/mzeitlin8/AdChainRegistry/blob/indefiniteListing/Registry.png)


## Application Process

1.  A publisher calls ```apply()``` to create an application and puts down a deposit of AdToken.  The apply stage for the application begins. During the apply stage, the application is waiting to be added to the whitelist, but can be challenged or left unchallenged.

    The application is challenged:

    1.  A challenger calls ```challenge()``` and puts down a deposit that matches the publisher's.

    2.  A vote starts (see Voter and Reward Process).

    3.  After the results are in, the anyone calls ```updateStatus()```.  
        
        If the applicant won, the domain is moved to the whitelist and they recieve a portion of the challenger's deposit as a reward.  Their own deposit is saved by the registry.

        If the challenger won, their deposit is returned and they recieve a portion of the applicant's deposit as a reward.

    The application goes unchallenged:

    1.  At the end of the apply stage, ```updateStatus()``` may be called, which adds their name to the whitelist.
        The applicant's deposit is saved and can be withdrawn when their whitelist period expires.

2.  To check if a publisher is in the registry, anyone can call ```isWhitelisted()``` at any time.



## Rechallenges

1.  Once a domain is whitelisted, it can be re challenged at any time. To challenge a domain already on the whitelist, a challenger calls ```challenge()``` and puts down a deposit of adToken to match the current minDeposit parameter.

2. If a whitelisted domain is challenged and does not have enough tokens deposited into the contract (ie a whitelist's current deposit is less than the minDeposit parameter), then the domain is automatically removed from the whitelist.



## Publisher Interface

1.  Deposit() - if the minDeposit amount is reparametrized to a higher value, then owners of whitelisted domains can increase their deposit in order to avoid being automatically removed from the whitelist in the event that their domain is challenged.

2.  Withdraw() - if the minDeposit amount is reparametrized to a lower value, then the owners of a whitelisted domain can withdraw unlocked tokens. Tokens locked in a challenge may not be withdrawn.

3.  Exit() - the owner of a listing can call this function in order to voluntarily remove their domain from the whitelist. Domains may not be removed from the whitelist if there is an ongoing challenge on that domain.



## Voter and Reward Process

1.  The vote itself is created and managed by the PLCR voting contract.

2.  Voters who voted on the losing side gain no reward, but voters who voted on the winning side can call ```claimReward()```
    to claim a portion of the loser's (either the applicant's or the challenger's) deposit proportional to the amount of
    AdToken they contributed to the vote.

3.  Since the tokens can only be distributed in integer values, there may be a decimal amount of tokens that the voter
    cannot recieve.  This decimal amount is saved for each vote by the registry, creating a pool of leftover tokens that
    the winner (either the challenger or the applicant) can withdraw from at any time by calling ```claimExtraReward()```.



## Reparameterization Process

1.  To propose a new value for a parameter, a user calls ```changeParameter()``` and puts down a deposit of AdToken with the
    parameter and the new value they want to introduce. A vote to make or disregard the proposed change is started immediately. 
    The deposit will be returned to the user upon completion of the poll.

2. After voters have committed and revealed their votes within the vote contract, anyone calls ```processProposal()``` to evaluate the results of the vote. Deposited tokens are returned to the user who proposed the parameter change. If the results show that the proposed change is approved, the parameter value in the params mapping is changed. 

3.  To check the value of parameters, a user calls ```get()``` with the string keyword of the parameter.
