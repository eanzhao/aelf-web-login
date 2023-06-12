import React, { useRef, useMemo, useCallback, useEffect } from 'react';
import { useAElfReact } from '@aelf-react/core';
import { getConfig } from '../../config';
import { CallContractParams, SignatureParams, WalletHookInterface, WalletHookParams } from '../types';
import { WalletType, WebLoginState } from '../../constants';
import isMobile from '../../utils/isMobile';
import checkSignatureParams from '../../utils/signatureParams';

export function useElf({
  isConnectEagerly,
  loginState,
  setLoading,
  setLoginError,
  setLoginState,
  setWalletType,
}: WalletHookParams & { isConnectEagerly: boolean }) {
  const chainId = getConfig().chainId;
  const nodes = getConfig().aelfReact.nodes;

  const timeoutLoginingRef = useRef<() => void>(() => {
    console.log('timeoutLoginingRef');
  });
  const eagerlyCheckRef = useRef(false);
  const initializingRef = useRef(false);
  const { isActive, account, pubKey, name, aelfBridges, activate, connectEagerly, deactivate } = useAElfReact();
  const nightElfInfo = useAElfReact();

  const bridge = useMemo(() => {
    return aelfBridges?.[chainId];
  }, [aelfBridges, chainId]);

  const chain = useMemo(() => {
    const bridge = aelfBridges?.[chainId];
    return bridge?.chain;
  }, [aelfBridges, chainId]);

  const initialWallet = useCallback(async () => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setLoading(true);
    try {
      if (!isMobile()) {
        await chain!.getChainStatus();
      }
      setWalletType(WalletType.elf);
      setLoginState(WebLoginState.logined);
    } catch (error) {
      setLoginError(error);
      setLoginState(WebLoginState.initial);
    } finally {
      setLoading(false);
    }
    initializingRef.current = false;
  }, [setLoading, chain, setWalletType, setLoginState, setLoginError]);

  useEffect(() => {
    if (isActive && loginState === WebLoginState.logining) {
      initialWallet();
    }
  }, [isActive, loginState, initialWallet]);

  const timeoutLogining = useCallback(() => {
    if (loginState !== WebLoginState.logining) return;
    if (!isActive) {
      // TODO cancel callback
      console.log('cancel login: timeout');
      localStorage.removeItem('aelf-connect-eagerly');
      setLoginState(WebLoginState.initial);
      setLoading(false);
    }
  }, [isActive, loginState, setLoading, setLoginState]);
  timeoutLoginingRef.current = timeoutLogining;

  const login = useCallback(async () => {
    let timer;
    try {
      setLoginState(WebLoginState.logining);
      timer = setTimeout(() => {
        timeoutLoginingRef.current();
      }, 8000);
      console.log('activate');
      await activate(nodes);
      console.log('activated');
    } catch (e) {
      setLoading(false);
      setLoginError(e);
      setLoginState(WebLoginState.initial);
    } finally {
      clearTimeout(timer);
    }
  }, [activate, nodes, setLoading, setLoginError, setLoginState]);

  const loginEagerly = useCallback(async () => {
    setLoading(true);
    try {
      console.log('connectEagerly', loginState);
      setLoginState(WebLoginState.logining);
      await login();
    } catch (e) {
      localStorage.removeItem('aelf-connect-eagerly');
      setLoading(false);
      setLoginError(e);
      setLoginState(WebLoginState.initial);
    }
  }, [login, loginState, setLoading, setLoginError, setLoginState]);

  const logout = useCallback(async () => {
    setLoginState(WebLoginState.logouting);
    try {
      localStorage.removeItem('aelf-connect-eagerly');
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

  const getSignatureInMobileApp = useCallback(
    async (params: SignatureParams) => {
      if (!bridge || !isActive) {
        throw new Error('Elf not login');
      }
      if (!bridge.sendMessage) {
        throw new Error('bridge.sendMessage is not a function');
      }
      let hex = '';
      if (params.hexToBeSign) {
        hex = params.hexToBeSign!;
      } else {
        hex = Buffer.from(params.signInfo, 'utf-8').toString('hex');
      }
      const signedMsgObject = await bridge.sendMessage('keyPairUtils', {
        method: 'sign',
        arguments: [hex],
      });
      if (!signedMsgObject) {
        throw new Error('signedMsgObject is null');
      }
      if (signedMsgObject?.error) {
        throw new Error(
          signedMsgObject.errorMessage.message || signedMsgObject.errorMessage || signedMsgObject.message,
        );
      }
      const signedMsgString = [
        signedMsgObject.r.toString(16, 64),
        signedMsgObject.s.toString(16, 64),
        `0${signedMsgObject.recoveryParam.toString()}`,
      ].join('');
      return {
        error: 0,
        errorMessage: '',
        signature: signedMsgString,
        from: 'aelf-bridge',
      };
    },
    [bridge, isActive],
  );

  const getSignature = useCallback(
    async (params: SignatureParams) => {
      checkSignatureParams(params);
      if (!bridge || !isActive) {
        throw new Error('Elf not login');
      }
      if (!bridge.getSignature) {
        return await getSignatureInMobileApp(params);
      }
      let hex = '';
      if (params.hexToBeSign) {
        hex = params.hexToBeSign!;
      } else {
        hex = Buffer.from(params.signInfo, 'utf-8').toString('hex');
      }
      const signature = await bridge!.getSignature({
        address: params.address,
        hexToBeSign: hex,
      });
      return signature;
    },
    [bridge, getSignatureInMobileApp, isActive],
  );

  useEffect(() => {
    if (eagerlyCheckRef.current) {
      return;
    }
    eagerlyCheckRef.current = true;
    const canEagerly = localStorage.getItem('aelf-connect-eagerly') === 'true';
    if (canEagerly) {
      if (isConnectEagerly) {
        if (loginState === WebLoginState.initial) {
          loginEagerly();
        }
      } else {
        setLoginState(WebLoginState.eagerly);
      }
    }
  }, [loginState, isConnectEagerly, loginEagerly, setLoginState]);

  return useMemo<WalletHookInterface>(
    () => ({
      wallet: {
        name,
        address: account || '',
        publicKey: pubKey,
        nightElfInfo,
        accountInfoSync: {
          syncCompleted: loginState === WebLoginState.logined,
          holderInfo: undefined,
        },
      },
      loginEagerly,
      login,
      logout,
      callContract,
      getSignature,
    }),
    [name, account, pubKey, nightElfInfo, loginState, loginEagerly, login, logout, callContract, getSignature],
  );
}
