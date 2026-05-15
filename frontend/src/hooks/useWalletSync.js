/**
 * useWalletSync Hook
 * Synchronizes wallet state with auth context
 */

import { useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import {
  subscribeWalletEvents,
  getCurrentChainId,
  getCurrentAddress,
} from '../services/walletManager';
import { updateProfileSettings } from '../services/supabaseService';
import { BLOCKCHAIN, TIMINGS } from '../utils/constants';
import { parseBlockchainError } from '../utils/errorMessages';

/**
 * useWalletSync Hook
 * Handles wallet connection changes and keeps auth in sync
 */
export function useWalletSync() {
  const { profile, updateProfile } = useAuth();
  const { wallet, loadAppState } = useAppContext();
  const unsubscribeRef = useRef(null);
  const isInitializedRef = useRef(false);
  const checkIntervalRef = useRef(null);

  /**
   * Handle account change
   */
  const handleAccountChange = useCallback(
    async (newAddress) => {
      try {
        // If account changed and was previously connected, reload app state
        if (wallet.account && wallet.account !== newAddress) {
          toast.loading('Wallet account changed. Reloading...', { id: 'wallet-change' });

          // Update profile with new wallet
          if (profile?.user_id && newAddress) {
            await updateProfileSettings(profile.user_id, {
              wallet_address: newAddress,
            });
          }

          // Reload documents and permissions
          if (loadAppState) {
            await loadAppState();
          }

          toast.success('Wallet account updated', { id: 'wallet-change' });
        }
      } catch (error) {
        toast.error(`Wallet sync error: ${parseBlockchainError(error)}`, {
          id: 'wallet-change',
        });
      }
    },
    [wallet.account, profile?.user_id, updateProfile, loadAppState]
  );

  /**
   * Handle chain change
   */
  const handleChainChange = useCallback(
    async (chainId) => {
      try {
        const isValidChain = chainId === BLOCKCHAIN.CHAIN_ID;

        if (!isValidChain && wallet.account) {
          toast.error(
            `Wrong network. Please switch to ${BLOCKCHAIN.CHAIN_NAME} (Chain ID ${BLOCKCHAIN.CHAIN_ID})`,
            { id: 'chain-change' }
          );
        }
      } catch (error) {
        console.error('Chain change error:', error);
      }
    },
    [wallet.account]
  );

  /**
   * Poll for wallet changes (fallback for missing events)
   */
  const startPolling = useCallback(() => {
    if (checkIntervalRef.current) return;

    checkIntervalRef.current = setInterval(async () => {
      try {
        if (!window.ethereum) return;

        const [currentAddress, currentChainId] = await Promise.all([
          getCurrentAddress({ requestIfMissing: false }),
          getCurrentChainId().catch(() => null),
        ]);

        if (wallet.account && wallet.account !== currentAddress) {
          handleAccountChange(currentAddress);
        }

        if (wallet.chainId && wallet.chainId !== currentChainId) {
          handleChainChange(currentChainId);
        }
      } catch (error) {
        // Silently ignore polling errors
        console.debug('Wallet polling error:', error);
      }
    }, TIMINGS.WALLET_SYNC_CHECK_MS);
  }, [wallet.account, wallet.chainId, handleAccountChange, handleChainChange]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  /**
   * Initialize wallet sync
   */
  const initialize = useCallback(() => {
    if (isInitializedRef.current) return;

    try {
      // Subscribe to wallet events
      unsubscribeRef.current = subscribeWalletEvents({
        onAccountsChanged: (accounts) => {
          const newAddress = accounts?.[0] || null;
          handleAccountChange(newAddress);
        },
        onChainChanged: (chainId) => {
          // chainId is a hex string, convert to number
          const chainIdNumber = parseInt(chainId, 16);
          handleChainChange(chainIdNumber);
        },
        onDisconnect: () => {
          toast.info('Wallet disconnected');
          stopPolling();
        },
      });

      // Start polling as fallback
      startPolling();

      isInitializedRef.current = true;
    } catch (error) {
      console.error('Wallet sync initialization error:', error);
    }
  }, [handleAccountChange, handleChainChange, stopPolling, startPolling]);

  /**
   * Cleanup
   */
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (error) {
          console.error('Error unsubscribing wallet events:', error);
        }
      }
      stopPolling();
    };
  }, [stopPolling]);

  /**
   * Initialize on profile change
   */
  useEffect(() => {
    if (profile?.user_id && wallet.status === 'connected') {
      initialize();
    }
  }, [profile?.user_id, wallet.status, initialize]);

  return {
    initialize,
    stopPolling,
    isInitialized: isInitializedRef.current,
  };
}

export default useWalletSync;
