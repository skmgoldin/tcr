# AdChainRegistry

![alt text](https://github.com/mzeitlin8/AdChainRegistry/blob/master/Registry.png)


## Application Process

1.  A publisher calls ```apply()``` to create an application and puts down a deposit of AdToken.  The challenge period for 
    the application begins, and the application is either challenged or left unchallenged.

    The application is challenged:

    1.  A challenger calls ```challengeApplication()``` and puts down a deposit that matches the publisher's.

    2.  A vote starts (see Voter and Reward Process).

    3.  After the results are in, the winner (applicant or challenger) calls ```processResult()```.  
        
        If the applicant won, their name is moved to the whitelist and they recieve a portion of the challenger's deposit as a reward.  Their own deposit is saved by the registry and can be withdrawn when the whitelist period expires.

        If the challenger won, their deposit is returned and they recieve a portion of the applicant's deposit as a reward.

    The application goes unchallenged:

    1.  At the end of the challenge period, the applicant calls ```moveToRegistry()```, which adds their name to the whitelist.
        The applicant's deposit is saved and can be withdrawn when their whitelist period expires.

2.  To check if a publisher is in the registry, anyone can call ```isVerified()``` at any time.

3.  To claim their deposit once their whitelist period is expired, the publisher calls ```claimDeposit()``` with the amount
    of their deposit they wish to claim.



## Reapplication Process

1.  When publisher calls ```apply()``` if they are already on the whitelist or have ever been on the whitelist, the behavior       is slightly different. It can be called regardless of whether the current listing is expired or not, and it has two 
    advantages for the publisher - it allows a publisher's locked deposit to be used towards the renewal's deposit before the     listing has expired, and it allows a publisher to stack another whitelist listing on top of their current one that can be 
    activated as soon as the current expires.
    
2.  A publisher can only have one renew application / not activated renewal at once that extends their listing.  This  
    can be checked with ```hasRenewal()```.

3.  The renewal application is treated like a regular application described in the Application Process: a challenger 
    calls ```challengeApplication()``` and the challenger / applicant calls ```processApplication()```. If the application is not
    challenged, the applicant calls ```moveToRegistry()```. If the application passes, instead of adding the publisher's name
    to the registry, it initializes new whitelist period attributes to be activated by the publisher any time after
    their current listing has expired. 


4.  The publisher activates their renewal after the current whitelist period is over by calling ```activateRenewal()```,
    meaning their registry data is now updated - they can now call ```apply()``` again, or withdraw their newly unlocked
    tokens through ```claimDeposit()```.  

5.  Even if ```activateRenewal()``` has not been called yet, ```isVerified()``` will still return true until the end of
    both the current whitelist period and the renewal period so that the publisher will stay on the whitelist through the
    transition, regardless of how quick they are to call ```activateRenewal()```.

5.  They may now start a new renewal if they wish.



## Voter and Reward Process

1.  The vote itself is created and managed by the PLCR voting contract.

2.  Voters who voted on the losing side gain no reward, but voters who voted on the winning side can call ```claimReward()```
    to claim a portion of the loser's (either the applicant's or the challenger's) deposit proportional to the amount of
    AdToken they contributed to the vote.

3.  Since the tokens can only be distributed in integer values, there may be a decimal amount of tokens that the voter
    cannot recieve.  This decimal amount is saved for each vote by the registry, creating a pool of leftover tokens that
    the winner (either the challenger or the applicant) can withdraw from at any time by calling ```claimExtraReward()```.



## Reparameterization Process

1.  To propose a new value for a parameter, a user calls ```proposeUpdate()``` by putting down a deposit of AdToken with the
    parameter and the new value they want to introduce. The challenge period for the reparametriztion begins, and it is
    either challenged or left unchallenged.

    The reparametrization is challenged:

    1.  A challenger calls ```challengeProposal()``` by putting down a deposit that matches the proposer's.

    2.  A vote starts (see Voter and Reward Process).

    3.  After the results are in, the winner calls ```processProposal()```.  
        
        If the proposer won, the parameter is assigned the new value, they recieve their deposit back, and they
        recieve a portion of the challenger's deposit.

        If the challenger won, their deposit is returned and they recieve a portion of the proposer's deposit as a 
        reward.

    The reparametrization goes unchallenged:

    1.  At the end of the challenge period, the proposer calls ```setParams()```, which assigns the parameter to the proposed
        value.  The proposer's deposit is returned.

2.  To check the value of parameters, a user calls ```get()``` with the string keyword of the parameter.
