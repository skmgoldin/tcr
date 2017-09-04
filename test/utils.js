async function getVoting() {
  const votingAddr = await registry.voting.call();
  return PLCRVoting.at(votingAddr);
}

// increases time
async function increaseTime(seconds) {
  return new Promise((resolve, reject) => ethRPC.sendAsync({
    method: 'evm_increaseTime',
    params: [seconds],
  }, (err) => {
    if (err) reject(err);
    resolve();
  }))
    .then(() => new Promise((resolve, reject) => ethRPC.sendAsync({
      method: 'evm_mine',
      params: [],
    }, (err) => {
      if (err) reject(err);
      resolve();
    })));
}

function getSecretHash(vote, salt) {
  return `0x${abi.soliditySHA3(['uint', 'uint'],
    [vote, salt]).toString('hex')}`;
}

async function buyTokens(address, etherAmount) {
  const sale = await Sale.deployed();
  await sale.purchaseTokens({ from: address, value: etherAmount });
}

async function approvePLCR(address, adtAmount) {
  const plcrAddr = await registry.voting.call();
  await token.approve(plcrAddr, adtAmount, { from: address });
}

async function setupForTests(accounts) {
  async function buyTokensFor(addresses) {
    await buyTokens(addresses[0], '1000000000000000000');
    if (addresses.length === 1) { return true; }
    return buyTokensFor(addresses.slice(1));
  }

  async function approveRegistryFor(addresses) {
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await token.approve(registry.address, balanceOfUser, { from: user });
    if (addresses.length === 1) { return true; }
    return approveRegistryFor(addresses.slice(1));
  }

  async function approvePLCRFor(addresses) {
    const user = addresses[0];
    const balanceOfUser = await token.balanceOf(user);
    await approvePLCR(user, balanceOfUser);
    if (addresses.length === 1) { return true; }
    return approvePLCRFor(addresses.slice(1));
  }
  registry = await Registry.deployed();
  token = Token.at(await registry.token.call());

  [applicant, challenger, voter] = accounts.slice(1);

  await buyTokensFor(accounts.slice(1));
  await approveRegistryFor(accounts.slice(1));
  await approvePLCRFor(accounts.slice(1));
}