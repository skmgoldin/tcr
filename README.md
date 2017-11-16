# Token-Curated Registry

[ ![Codeship Status for skmgoldin/tcr](https://app.codeship.com/projects/b140cce0-ac77-0135-0738-52e8b96e2dec/status?branch=master)](https://app.codeship.com/projects/257003)

A string-keyed TCR.


## Commands

Compile contracts using truffle

    $ npm run compile

Run tests

    $ npm run test

Run tests and log TestRPC stats

    $ npm run test gas


## Application Process

A candidate calls `apply()` to create an application and puts down a deposit in the registry's intrinsic token.  The apply stage for the application begins. During the apply stage, the application is waiting to be added to the whitelist, but can be challenged or left unchallenged.

The application is challenged:

1.  A challenger calls `challenge()` and puts down a deposit that matches the candidate's.

2.  A vote starts (see Voter and Reward Process).

3.  After the results are in, the anyone calls `updateStatus()`.  
        
If the candidate wins, the listing is moved to the whitelist and they recieve a portion of the challenger's deposit as a reward.  Their own deposit is kept with the listing.

If the challenger wins, their deposit is returned and they recieve a portion of the candidates's deposit as a reward.

The application goes unchallenged:

At the end of the apply stage, `updateStatus()` may be called, which adds their name to the whitelist.

The applicant's deposit is kept with the listing and can be withdrawn with the exit function, which also removes the listing.

To check if a candidate is in the registry, anyone can call `isWhitelisted()` at any time.



## Rechallenges

1.  Once a listing is whitelisted, it can be challenged at any time. To challenge a listing already on the whitelist, a challenger calls `challenge()` and puts down a deposit in the registry's intrinsic token to match the current minDeposit parameter.

2. If a whitelisted listing is challenged and does not have enough tokens deposited into the contract (ie a whitelist's current deposit is less than the minDeposit parameter), then the listing is automatically removed from the whitelist.

## Listed-candidate Interface

1.  Deposit() - if the minDeposit amount is reparametrized to a higher value, then owners of whitelisted listings can increase their deposit in order to avoid being automatically removed from the whitelist in the event that their listing is challenged.

2.  Withdraw() - if the minDeposit amount is reparametrized to a lower value, then the owners of a whitelisted listing can withdraw unlocked tokens. Tokens locked in a challenge may not be withdrawn.

3.  Exit() - the owner of a listing can call this function in order to voluntarily remove their listing from the whitelist. Domains may not be removed from the whitelist if there is an ongoing challenge on that listing.



## Voter and Reward Process

1. The vote itself is created and managed by the PLCR voting contract.

2. oters who voted on the losing side gain no reward, but voters who voted on the winning side can call `claimReward()` to claim a portion of the loser's (either the applicant's or the challenger's) deposit proportional to the amount of the registry's intrinsic token they contributed to the vote.

3. No tokens are ever lost or burned because the reward pool of tokens is repartitioned every time `claimReward()` is called. 


