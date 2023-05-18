import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAElfReact } from '@aelf-react/core';
import { useEffectOnce } from 'react-use';
import { getConfig } from '../../config';
import { CallContractParams, WalletHookInterface, WalletHookParams } from '../types';
import { WalletType, WebLoginState } from '../../constants';

export function useElf({
  isConnectEagerly,
  loginState,
  setLoginError,
  setLoginState,
  setWalletType,
}: WalletHookParams & { isConnectEagerly: boolean }) {
  const chainId = getConfig().chainId;
  const nodes = getConfig().aelfReact.nodes;

  const [initializing, setInitializing] = useState(false);
  const { isActive, account, aelfBridges, activate, connectEagerly, deactivate } = useAElfReact();

  const chain = useMemo(() => {
    const bridge = aelfBridges?.[chainId];
    return bridge?.chain;
  }, [aelfBridges, chainId]);

  const initialWallet = useCallback(async () => {
    if (initializing) return;
    setInitializing(true);
    try {
      await chain!.getChainStatus();
      setWalletType(WalletType.elf);
      setLoginState(WebLoginState.logined);
    } catch (error) {
      setLoginError(error);
      setLoginState(WebLoginState.initial);
    }
    setInitializing(false);
  }, [initializing, chain, setWalletType, setLoginState, setLoginError]);

  useEffect(() => {
    if (isActive && loginState === WebLoginState.logining) {
      initialWallet();
    }
  }, [isActive, chainId, setLoginState, loginState, initialWallet]);

  const loginEagerly = useCallback(async () => {
    try {
      setLoginState(WebLoginState.logining);
      await connectEagerly(nodes);
    } catch (e) {
      setLoginError(e);
    }
  }, [connectEagerly, nodes, setLoginError, setLoginState]);

  const login = useCallback(async () => {
    try {
      setLoginState(WebLoginState.logining);
      await activate(nodes);
    } catch (e) {
      setLoginError(e);
    }
  }, [activate, nodes, setLoginError, setLoginState]);

  const logout = useCallback(async () => {
    try {
      await deactivate();
    } catch (e) {
      console.warn(e);
    }
    setLoginState(WebLoginState.initial);
  }, [deactivate, setLoginState]);

  const callContract = useCallback(
    async function callContractFunc<T, R>(params: CallContractParams<T>): Promise<R> {
      if (!isActive || !account || !chain) {
        throw new Error('Elf not login');
      }
      // TODO: fixes cache contract
      const contract = await chain.contractAt(params.contractAddress, {
        address: account!,
      });
      return await contract[params.methodName](params.args);
    },
    [isActive, chain, account],
  );

  useEffectOnce(() => {
    const canEagerly = localStorage.getItem('aelf-connect-eagerly') === 'true';
    if (canEagerly) {
      if (isConnectEagerly) {
        loginEagerly();
      } else {
        setLoginState(WebLoginState.eagerly);
      }
    }
  });

  return useMemo<WalletHookInterface>(
    () => ({
      loginEagerly,
      login,
      logout,
      callContract,
    }),
    [callContract, login, loginEagerly, logout],
  );
}
