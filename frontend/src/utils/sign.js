export async function signHash(hash) {
  if (!window.ethereum) {
    throw new Error("MetaMask not found");
  }

  let accounts = await window.ethereum.request({
    method: "eth_accounts",
  });

  if (!accounts.length) {
    accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
  }

  const account = accounts[0];

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: ["0x" + hash, account],
  });

  return {
    signature,
    signer: account,
  };
}
