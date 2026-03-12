import { recoverTypedDataAddress, type Hash } from "viem";
import { USDM_ADDRESS, MEGAETH_CHAIN_ID } from "../shared/constants.js";

/**
 * Recovers the signer of an EIP-2612 Permit typed data signature.
 */
export async function recoverPermitSigner(params: {
  token?: string;
  owner: string;
  spender: string;
  value: bigint;
  deadline: bigint;
  nonce: bigint;
  signature: { v: number; r: Hash; s: Hash };
}) {
  const {
    token = USDM_ADDRESS,
    owner,
    spender,
    value,
    deadline,
    nonce,
    signature,
  } = params;

  return recoverTypedDataAddress({
    domain: {
      name: "MegaUSD",
      version: "1",
      chainId: MEGAETH_CHAIN_ID,
      verifyingContract: token as `0x${string}`,
    },
    types: {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    message: {
      owner: owner as `0x${string}`,
      spender: spender as `0x${string}`,
      value: value,
      nonce: nonce,
      deadline: deadline,
    },
    signature: {
      v: BigInt(signature.v),
      r: signature.r,
      s: signature.s,
    },
  });
}
