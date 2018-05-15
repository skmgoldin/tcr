# TCR Owner's Manual

Prospect Park Edition

## Intro

This [token-curated registry (TCR)](https://medium.com/@ilovebagels/token-curated-registries-1-0-61a232f8dac7) implementation is motivated by a goal of enabling anybody to quickly and easily stand up a simple TCR compatible with a number of graphical user interfaces. Named *Prospect Park*, it is the inaugural TCR release by the Cryptosystems Productization Lab at ConsenSys.

## Applying a listing to your TCR

To `apply` a new listing to the TCR, use the apply function. The `apply` function takes three arguments:

* A listing hash: a 32-byte hash of the listing’s identifier.

* A number of tokens to deposit. Must be at least the registry’s minDeposit requirement (see [Parameterizing your TCR)](#parameterizing-your-tcr).

* An arbitrary data string which can be used to point to additional information about the proposed listing.
```javascript
function apply(bytes32 _listingHash, uint _amount, string _data)
```
When making an application, the user first needs to approve the registry contract to transfer tokens on their behalf greater than or equal to the _amount argument they intend to specify.

Prospect Park* *uses [listing hashes](#listing-hash) to support arbitrary listing types. There is no need to modify Prospect Park* *to use it as a TCR of images, sounds, Ethereum addresses, books, or Good Ideas. The listing hash provided in the apply function should correspond to a [listing identifier](#listing-identifier) provided in the data string.

There are many ways to use the [data](#data) string, but the "correct" usage for a particular TCR should be established [by convention](#convention-also-by-convention). Without a conventional usage standard, applicants will struggle to understand how to provide sufficient information to token-holders in their applications, and client software may fail to properly parse the provided data.

When a user opens an application, they are putting tokens at stake and may lose them! Once an application is made, an application period begins immediately, the duration of which is a registry parameter. During the application period, any token holder may [challenge](#challenging-an-application-or-listing) the application by putting down a matching deposit, which begins a token-weighted [vote](#voting-in-a-challenge) to decide the applicant’s fate!

If the application period passes without a challenge being opened, the applicant can call the `updateStatus` function with their application item’s listing hash.

```javascript
function updateStatus(bytes32 _listingHash)
```

This will poke the application into the registry. But remember, even once a candidate has been listed, that listing can still be challenged at any time--[its deposit remains at stake](#managing-your-listing)!

### Events emitted by an application

An `_Application` event is emitted if the application is successful:

``` javascript
event _Application(bytes32 indexed listingHash, uint deposit, uint appEndDate, string data, address indexed applicant)
```

### A trivial convention for corresponding the listing hash and data string

In the TCR of good colleges, the name of a university ("Columbia University" or “Bennington College”) should suffice to differentiate any university from another. A trivial convention for locating listing identifiers and checking their correspondence to listing hashes in this TCR would be to use the university name (its listing identifier) as the data argument, and the keccak-256 hash of that argument as the listing hash. This way client software can listen for application events and check programmatically whether the data string corresponds to the listing hash. If the data string does correspond to the listing hash, the GUI can render the human-readable listing identifier to a GUI. If the listing hash and data string do not correspond, the UI should warn the user that foul play is likely afoot: the data string reads “Princeton University” but the listing hash is that of “Trump University”!

This example is trivial, but may work for candidate types where publicly available information corresponding to the listing identifier suffices to make informed decisions about candidate inclusion. There is lots of publicly available data about student outcomes accessible with only the name of the university one seeks the data for.

### A recommended convention for using the data string

For many listing types, token-holders may require that specific, structured information be provided in the application process. Imagine a TCR of reputable neurosurgeons, for example, where multiple attestations of various types may be required: board certifications, employment histories, academic credentials, professional references, et cetera. These attestations may be provided in various forms, from scanned images to cryptographically signed messages to videos. The name of a particular neurosurgeon, while unique, may not have sufficient publicly available information attached to it for token holders to make a conscientious decision regarding its inclusion. Rather than putting all of that information on-chain, it can be hosted on a content-addressed filesystem like IPFS and provided in the data field as a short [content identifier](https://github.com/ipld/cid#cidv1) (CID).

Without the resource constraints of a blockchain, the data resolved by the CID can be one of many different serialized formats; we recommend JSON as it closely resembles and is compatible with the data model of [IPLD](https://ipld.io/).

The listing identifier should always be a property in this object called *id*. The keccak-256 hash of the *id* property’s value should be the listing hash argument of the [`apply` function](#applying-a-listing-to-your-tcr). Additional properties may be included as dictated by convention: a "board_cert" property with a URL at an FTP server under a reputable (.gov) domain which will produce the applicant’s medical board certification records, for example.

For more information on these recommended conventions for corresponding listing hashes with listing identifiers, [see Isaac Kang’s writeup](https://github.com/kangarang/tcr-ui/blob/master/docs/IPFS.md).

## Challenging an application or listing

To challenge an application or a listing, use the challenge function. The challenge function takes two arguments: the listing hash of the listing you want to challenge, and a data string. The data string in the challenge function can be used to include evidence or claims justifying your challenge (or a link to evidence and claims).

``` javascript
function challenge(bytes32 _listingHash, string _data)
```

When challenging a listing, the user first needs to approve the registry contract to transfer tokens on their behalf equal to the registry’s current minDeposit parameter.

When a user challenges an application or listing, they are putting tokens at stake and may lose them! They also may win, however, in which case they will get back their own deposit, plus a sum of tokens equal to the dispensationPct (a registry parameter) of their opponent’s stake.

When a new challenge is made, a new poll is instantiated in the registry’s PLCRVoting contract. The ID of this poll will be emitted in two events fired in the transaction. In the _Challenge event fired by the registry contract it is the challengeID parameter. In the _PollCreated event fired by the PLCRVoting contract it is the pollID parameter. This poll ID can be used to interact with the vote associated with the challenge. See the [voting section](#voting-in-a-challenge) of this document for more information.

Once the revealPeriod of the challenge vote has ended, anybody can call the `updateStatus` function with the challenged listing’s listing hash.

``` javascript
function updateStatus(bytes32 _listingHash)
```

This interaction path should be exposed to the challenge winner in GUIs, as they have a financial incentive to take the action. If `updateStatus` is invoked following a challenge and the challenger won, the listing owner is transferred any tokens they staked above the minDeposit requirement, while the challenger is transferred their own deposit plus their reward (the special dispensation of the listing owner’s deposit). If `updateStatus` is invoked following a challenge and the listing owner won, the listing owner’s deposit and reward are both added to the listing’s unstaked deposit, available to be withdrawn by the listing owner.

There is one edge case where a challenge will not result in a new poll being instantiated: "touch-and-remove". Touch-and-remove is described in the TCR 1.0 paper as the edge case where a registry’s minimum deposit parameter is increased after a candidate becomes listed, leaving the candidate with a smaller deposit than the current canonical deposit requirement, and another user challenges them. In this case, the listing is immediately removed, but both the applicant and the challenger get their tokens back. Touch-and-remove enables cheaper removal of  listings which have gone bad, but whose deposits are too small to profitably challenge otherwise.

### Events emitted by a challenge

In the event of a touch-and-remove, only a single event is emitted:

``` javascript
_TouchAndRemoved(_listingHash)
```

Otherwise, two events are emitted:

``` javascript
event _PollCreated(uint voteQuorum, uint commitEndDate, uint revealEndDate, uint indexed pollID, address indexed creator)
```

``` javascript
event _Challenge(bytes32 indexed listingHash, uint challengeID, string data, uint commitEndDate, uint revealEndDate, address indexed challenger)
```

## Voting in a challenge

There are two phases to voting in a challenge: ["commit" and “reveal”](#commitreveal-voting). The duration of the commit and reveal periods are each registry parameters. When a challenge is opened, the commit period begins immediately and votes can be committed.

To commit a vote, the user needs to interact with TCR’s PLCRVoting (voting) contract. To get the voting contract’s address, call the TCR’s `voting` function.

Before participating in polls, users need to request voting rights in the PLCR contract. Before calling `requestVotingRights`, the user should approve the PLCR contract to transfer as many tokens on their behalf as they desire to vote with. After having done so, use the `requestVotingRights` function.

``` javascript
function requestVotingRights(uint _numTokens)
```

Once you have the voting contract’s address, you can send a commit transaction to its `commitVote` function. The `commitVote` function takes four arguments:

* A poll ID for the challenge, which was emitted as a log when the challenge was opened.

* A commit hash, which should be a salted keccak-256 hash of either zero or one.

* A number of tokens to vote with, which the PLCR contract will `transferFrom`.

* The poll ID of the poll in which this user has the greatest number of tokens less than the amount they are currently committing, committed. You can use the `getInsertPointForNumTokens` utility function in a simulated call to compute this value.

``` javascript
function commitVote(uint _pollID, bytes32 _secretHash, uint _numTokens, uint _prevPollID)
```

After committing their vote, a user will need to remember their vote and salt for when they come back to reveal it later. A best practice is to give the voter an opportunity to download a JSON or XML file containing their vote and salt which can be uploaded in the reveal phase.

A voter can change their commit hash prior to the commit stage ending, but not after, by invoking the commitVote function again for the same poll ID.

After the commit period expires, the reveal phase immediately begins. At this point, voters who participated in the commit phase can reveal their votes. The revealVote function takes three arguments:

* A poll ID corresponding to some poll ID the voter previously committed in, and for which it is now the reveal period.

* A vote choice corresponding to that which when concatenated with their salt produces a keccak-256 hash matching their commitment.

* A salt corresponding to that which when concatenated with their vote choice produces a keccak-256 hash matching their commitment.

``` javascript
function revealVote(uint _pollID, uint _voteOption, uint _salt)
```

When a user reveals their vote it is automatically tallied, and the user does not need to take any further action until the conclusion of the reveal period.

When the reveal period is over, if the voter revealed a vote on the winning side, they can also then claim a reward for having done so. Their reward will be proportional to their token weight in the vote relative to all other addresses who voted on the winning side. The `claimVoterReward` function takes two arguments, both of which can be derived from the same file the user downloaded after the commit step:

* The pollID the user wishes to claim a reward for.

* The salt they used when committing their vote.

``` javascript
function claimVoterReward(uint _challengeID, uint _salt)
```

If a voter feels they will not be participating in any further polls in the foreseeable future, they may desire to withdraw their tokens from the voting contract so that they can be used for other things. The `withdrawVotingRights` function can be used to retrieve as many tokens as the user specifies, up to the total amount they have deposited.

``` javascript
function withdrawVotingRights(uint _numTokens)
```

If a user committed tokens in a vote and neglected to reveal them in the reveal period, they will need to use the `rescueTokens` function to unlock them before they are withdrawn. The `rescueTokens` function takes one argument, which is the poll ID of the vote the user forgot to reveal in.

``` javascript
function rescueTokens(uint _pollID)
```

After invoking the `rescueTokens` function, the user afterwards still must explicitly call `withdrawVotingRights`.

## Managing your listing

To relinquish a listing and get a deposit refunded, the user can invoke the exit function with the listing hash they wish to relinquish. Only the address which applied the listing can remove it in this way, and the exit function is disabled while any active challenge is open against the listing.

``` javascript
function exit(bytes32 _listingHash)
```

When the exit function is successfully invoked the listing is removed the listing owner is refunded their deposit. Note that the *Prospect Park* release does not have a lockup period on exits! When a listing is exited, two events will be fired:

``` javascript
event _ListingWithdrawn(bytes32 indexed listingHash);
```
``` javascript
event _ListingRemoved(bytes32 indexed listingHash);
```

To avoid being [touch-and-removed](#challenging-an-application-or-listing), a listing owner may want to top up their deposit in advance of any increase to the minDeposit proposed in the parameterizer. This can be done using the deposit function.

```javascript
function deposit(bytes32 _listingHash, uint _amount)
```
The deposit function emits one event when successfully invoked:

```javascript
_Deposit(_listingHash, _amount, listing.unstakedDeposit, msg.sender)
```

To withdraw excess funds deposited with a listing, including funds received as the result of winning a challenge, the listing owner may use the withdraw function. The amount specified to withdraw must be less than or equal to the difference of the current canonical minDeposit parameter listing's total deposit.

```javascript
function withdraw(bytes32 _listingHash, uint _amount)
```

The withdraw function emits one event when successfully invoked:

```javascript
_Withdrawal(_listingHash, _amount, listing.unstakedDeposit, msg.sender);
```

## Parameterizing your TCR

A *Prospect Park* TCR has the same six parameters proposed in [the original token-curated registries paper](https://medium.com/@ilovebagels/token-curated-registries-1-0-61a232f8dac7), but they are not all implemented under the same names.

<table>
  <tr>
    <td><b>Name in "Token-Curated Registries 1.0"</td>
    <td><b>Name in Prospect Park</td>
  </tr>
  <tr>
    <td>MIN_DEPOSIT</td>
    <td>minDeposit</td>
  </tr>
  <tr>
    <td>APPLY_STAGE_LEN</td>
    <td>applyStageLen</td>
  </tr>
  <tr>
    <td>COMMIT_PERIOD_LEN</td>
    <td>commitStageLen</td>
  </tr>
  <tr>
    <td>REVEAL_PERIOD_LEN</td>
    <td>revealStageLen</td>
  </tr>
  <tr>
    <td>DISPENSATION_PCT</td>
    <td>dispensationPct</td>
  </tr>
  <tr>
    <td>VOTE_QUORUM</td>
    <td>voteQuorum [1]</td>
  </tr>
</table>

*[1]: See also: [voteQuorum is misnamed](#votequorum-is-misnamed)*

Values for these parameters are stored in a separate parameterizer contract. To read the current value of any parameter, call the `get` function with the parameter’s name.

``` javascript
function get(string _name) public view returns (uint)
```

The Parameterizer contract is also used for updating these parameters. To propose a new value for any parameter, any user can invoke the proposeReparameterization function, which takes as arguments the name of a parameter and a proposed new value for that parameter.

``` javascript
function proposeReparameterization(string _name, uint _value) public returns (bytes32)
```

Reparameterization proposals work rather similarly to applications in the registry itself. Before proposing a reparameterization, the user must approve the parameterizer contract to transfer a sum of tokens equal to *pMinDeposit*, which will be at stake for the duration of *pApplyStageLen*. But note that *pMinDeposit* and *pApplyStageLen *are not the same as *minDeposit* and *applyStageLen*!

### Governance Parameters

The parameterizer has its own parameters which are functionally equivalent to, but separate from, the registry parameters it stores. Informally, these are called "governance parameters".

<table>
  <tr>
    <td><b>Registry parameter</td>
    <td><b>Equivalent governance parameter</td>
  </tr>
  <tr>
    <td>minDeposit</td>
    <td>pMinDeposit</td>
  </tr>
  <tr>
    <td>applyStageLen</td>
    <td>pApplyStageLen</td>
  </tr>
  <tr>
    <td>commitStageLen</td>
    <td>pCommitStageLen</td>
  </tr>
  <tr>
    <td>revealStageLen</td>
    <td>pRevealStageLen</td>
  </tr>
  <tr>
    <td>dispensationPct</td>
    <td>pDispensationPct</td>
  </tr>
  <tr>
    <td>voteQuorum</td>
    <td>pVoteQuorum</td>
  </tr>
</table>


The governance parameters parameterize operations in the parameterizer itself. To update the *minDeposit* parameter of your registry will require staking *pMinDeposit* tokens in the parameterizer and waiting *pApplyStageLen*, if nobody challenges the proposal, to update the parameter. If there is a challenge against the reparameterization proposal, the duration of the voting period will be *pCommitStageLen* + *pRevealStageLen*. The proposal will require *pVoteQuorum *percent of the vote to pass, and the challenge winner’s special dispensation will be *pDispensationPct* of the loser’s deposit.

Just like the registry parameters, governance parameters can be accessed by their names using the get function, and new governance parameter values can be proposed using the `proposeReparameterization` function.

### Lifecycle of a reparameterization proposal

Aside from using [different parameter sets](#governance-parameters), reparameterization proposals and registry applications are more alike than different. The major difference is that when a reparameterization proposal is successful, the proposer’s deposit is returned to them rather than remaining staked, as in the registry. Reparameterization proposals can be challenged in their application phase, but once a proposal succeeds the only way to change that parameter is by making a new reparameterization proposal.

Once a user has invoked `proposeReparameterization`, any other user can invoke `challengeReparameterization` with the proposal identifier emitted as an event when `proposeReparameterization` was invoked.

``` javascript
function challengeReparameterization(bytes32 _propID) public returns (uint)
```

Like in the registry, this challenge function will attempt to transfer a sum of tokens from the caller equal to *pMinDeposit* such that two equal deposits will be at stake. The parameterizer has a `voting` function which will return the address of the PLCR instance attached to the parameterizer. This PLCR instance will be the same as that attached to the registry, meaning users with tokens locked in the PLCR contract for voting on registry applications can also use those to vote on reparameterization proposals.

## Building client software

When developing a TCR client, there are several idiosyncrasies to keep in mind if you wish to provide the best user-experience while not having yourself lost in a loophole of iterations. The idiosyncrasies described here cover basic TCR transactions, token distribution after voting, and the mental preparation needed as a developer when building client software.

The first idiosyncrasy to have in mind is to remember that you are building an application on a blockchain in 2018. This being said, users have to sign up to three transactions for single interactions with the TCR. If users do not have the ability to grant access for the TCR smart contracts to withdraw their tokens, their applications/challenges will fail. Therefore, always thoroughly test your user-flow when applying (2 TXs), challenging (2 TXs), committing (3 TXs)  and revealing (1 TX) votes in order to insure seamless user interaction.

Another idiosyncrasy to have in mind when developing a TCR for client access includes the proper distribution of token after an application and challenge. For example, a candidate is applied into the registry and challenged, with voting ending in favor of the candidate. Therefore, the candidate is entitled to the special dispensation (DISPENSATION_PCT*MIN_DEPOSIT) from the challenger, with the voters in-favor of the candidate receiving their special dispensation [(100 – DISPENSATION_PCT)*MIN_DEPOSIT]. Upon the candidate’s call to `updateStatus`, the will have the original staked amount plus the special dispensation token staked with the listing. The candidate, already in registry, can call the `withdraw` have the special dispensation token amount withdrawn from the listing and deposited in their wallet. Voters entitled to the remaining token, though, have to call `claimVoterReward` in order to receive their winnings. The voters must also call `withdrawVotingRights` to have their tokens used for voting returned. Many idiosyncrasies come into play here when a challenge occurs and leads to voting. Although it may seem like candidate proposals for parameter values would be more complicated than this, the only difference is that the candidates have their token returned if the proposed parameter value is successfully implemented.

The blockchain is essentially your ultimate backend/database; all other aspects of application architecture changes to support this. Since decentralized applications are asynchronous and exist globally, this thing is gonna run regardless of your frontend. So the frontend needs to update its state somehow to support all other interactions with the smart contracts.

Three ways of using historical transactions to build the current state of the TCR: poll for historical logs, listen to events, or use a traditional server/database. A server that's constantly polling for logs / listening to events can store this data in a traditional database and serve that data through an API to a frontend application. Although this requires trust, this is highly efficient and useful when prototyping.

Developing frontend blockchain software is different and fun! But being on the bleeding edge comes at a cost:

* Not all the libraries are fully-functional or play well with each other. Documentation is overall lacking -- need to search multiple sources to find answers. If you can’t find answers, open issues with questions. Sometimes the answer is simply "there’s a bug in the library".

* Using IPFS to store data is the optimal way to store large data sets in a decentralized, trustless manner. However IPFS is still in alpha and has a long way to go before it can be considered a reliable solution.

* Optimal user experience is unsolved -- sending multiple transactions can be intimidating and confusing. Onboarding and learning the rules of a TCR can make a user weary. Keeping up with parameter changes can be stressful. And much more.

### An algorithm which uses logs to build a view of the registry

Maintaining an up to date registry can be done using six events:

* _Application(bytes32 indexed listingHash, uint deposit, uint appEndDate, string data, address indexed applicant)

* _ApplicationWhitelisted(bytes32 indexed listingHash)

* _ApplicationRemoved(bytes32 indexed listingHash)

* _ListingRemoved(bytes32 indexed listingHash)

* _ListingWithdrawn(bytes32 indexed listingHash)

* _TouchAndRemoved(bytes32 indexed listingHash)

Note that every event, except Application, only provides the listing hash. In order to keep track of this additional data, the pertinent information has to be tracked and maintained to reference later or sorted though every time a new event is generated.

A recommended method to maintain a view of the registry is by using the application event and storing any pertinent info with the listingHash as the key. This can be done multiple ways but for simplicity’s sake, a HashMap will be used in this example. An important note to keep in mind is that the application must read in current events while handling past events to keep a coherent view of the application pool and registry. These current events will also have to be handled only when past events have been fully digested.

Step 1: Create filter or event stream to Ethereum network.

Step 2: Start buffering new events.

Step 3: Read in old events and sort out desired information.

Step 4: Use events information to create a view of the applicant pool and registry starting from the beginning of the registry and working to streamed/streaming events.

Pseudocode:
```
var registry = new Vector();

func maintain_registry() {

	// Provide the RPC endpoint for the ethereum node

const RPC_ENDPOINT = "https://localhost:8545";

// Store the address of the registry being used

const registry = 0x5E2Eb68A31229B469e34999C467b017222677183;

// Create instance of web3 using RPC_ENDPOINT

const web3 = new Web3(RPC_ENDPOINT);

// 

const eth_filter_stream_events = new EthFilter(web3.transport());

const eth_filter_past_events = new EthFilter(web3.transport());

const filter = FilterBuilder.default()

					.from_block(0)

					.to_block(Latest)

					.address(new Vector(registry))

					.build();

const filter_past_events = filter.copy();

const filter_stream_events = eth_filter_stream_events.create_logs_filter(filter)

				.wait();

const filter_past_events = eth_filter_past_events.create_logs_filter(filter_past_events)

				.wait();

var applications = new HashMap();

Var filter_stream = filter_stream_events.stream(Duration::from_secs(0))

			.for_each(|log| {

				const data_vector = log.data.0;

				const data_hash = log.topics[1].to_string();

				const topics = log.topics[0];

				log_handler(data_hash, &applications, topics, data_vector);

			});

const past_logs = filter_past_events.logs().wait();

for log in past_logs {

	const data_vector = log.data.0;

	const data_hash = log.topics[1].to_string();

	const topics = log.topics[0];

	log_handler(data_hash, &applications, topics, data_vector);

}

filter_stream.wait();

}

func log_handler(String data_hash,

HashMap<String,String> applications,

H256 topics,

Vector<byte> data_vector) {

	const application_hash = keccak256("_Application(bytes32,uint256,uint256,string,address)");

	const application_whitelisted_hash = keccak256("_ApplicationWhitelisted(bytes32)");

	const application_removed_hash = keccak256("_ApplicationRemoved(bytes32)");

	const listing_removed_hash = keccak256("_ListingRemoved(bytes32)");

	const listing_withdrawn_hash = keccak256("_ListingWithdrawn(bytes32)");

	const touch_and_removed_hash = keccak256("_TouchAndRemoved(bytes32)");

	If topics == application_hash {

		var data = new String();

		for iterator in 0..data_vector.len() {

		const current_char = data_vector[(data_vector.len() - 1

* iterator) as usize];

			if current_char > 122 {

break;

}

			else if current_char > 44 {

domain_name.push(current_char as char);

}

else {

	break;

}

		}

		data.reverse();

		applications.insert(data_hash, data);

	}

	else if topics == application_whitelisted_hash {

		registry.add(application[data_hash]);

	}

	else if topics == listing_removed_hash ||

				listing_withdrawn_hash ||

				touch_and_removed_hash {

		registry.remove(application[data_hash]);

		application.remove(data_hash);

}

else if topics == application_removed_hash {

	application.remove(data_hash);

}

}
```
### Examples

#### [The CPL UI](members.consensysadtech.net) ([repo](https://github.com/kangarang/tcr-ui))

*By Isaac Kang, Software Developer at ConsenSys*

This project is a group effort, and we are continuously looking for feedback as to how we can make user experience easier and more fun. The vision of this project is to build a registry-agnostic client-side UI to interact with any TCR. ABIs are provided locally to build contract abstractions. Optionally, the user can retrieve ABIs from IPFS. Once the contract ABIs are imported, the application view renders a TCRs current state using two inputs: provider/network choice and address of the Registry contract. We focus the UI on the current Listings, with further information such as listing details, rules, instructions, and transactions made available as needed.

#### [The AdChain Registry UI](registry.adchain.com)

*By Eddy Muñoz, Project Manager for AdChain at MetaX*

The adChain Registry will be the first token-curated registry on the Ethereum Mainnet. This being said, many of the ideas behind its v1 UI design implementation have been made without proper-user testing where users have skin-in-the-game incentives to curate the best list of domains possible. The adChain Registry is home to a variety of database-backed features. These features are added on-top of the core TCR code to enhance the best user experience possible. With a dashboard, users are able to keep track of domains they’ve applied, domains they’ve challenged and voted on, and domains which need the user to claimVoterReward in order to properly receive their special dispensation. Although a bare-bones UI can be designed to service TCRs across a spectrum of purposes, the adChain Registry will pioneer database-backed features which ultimately enhance user experience. 

## Errata

### voteQuorum is misnamed

In the world, a "quorum" refers to the proportion of participants in some group not abstaining required for a vote to be considered valid. You might imagine then that the voteQuorum parameter specifies the proportion of the total token supply required to vote for the vote’s outcome to be considered binding. This is not what voteQuorum is. voteQuorum should be called candidateSuccessThreshold, as it actually specifies the proportion of any vote required to be in favor of listing or keeping a candidate for that candidate to prevail in a challenge.

## Jargon

### Token-curated registry

Token-curated registries are decentrally-curated lists with intrinsic economic incentives for token holders to curate the list’s contents judiciously. The *Prospect Park *release generally adheres to [Mike Goldin’s "1.0" specification](https://medium.com/@ilovebagels/token-curated-registries-1-0-61a232f8dac7) of the concept.

### Listing identifier

A unique identifier for a listing which may be hashed to produce the listing hash. Listing identifiers can be arbitrarily long strings, images, sounds, or anything else which may be hashed.

### Listing hash

The keccak-256 hash of a listing identifier. Listing hashes are what are actually stored in a TCR.

### Data

An arbitrary string containing information about an application or challenge. The string may be a link to an external file sharing service, such as IPFS or an FTP server. For applications, either the string or the data object the string resolves should contain an identifier property under a well-known name whose value can be hashed to produce the applied listing hash.

### Convention (also "by convention")

A standard, practice, or expectation of a cryptocommunity which is not enforced programmatically. Defying conventions may arouse skepticism in the relevant cryptocommunity, but software should always handle non-conventional inputs (even if only to flag it as non-conventional).

### Commit/reveal voting

Commit/reveal voting is a two-stage voting process. In the first stage, users "commit" votes as salted hashes of their vote choices. In the second stage, once the commits are locked in, users reveal their votes by submitting to the blockchain their choice and their salt. On-chain, these are concatenated and hashed, and if that hash matches that which was originally submitted, the vote is counted.

