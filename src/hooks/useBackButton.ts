import { useEffect } from 'react';
import { App } from '@capacitor/app';

export const useBackButton = (handler: () => void) => {
    useEffect(() => {
        let unregister: () => void;

        App.addListener('backButton', () => {
            handler();
        }).then(result => {
            unregister = result.remove;
        });

        return () => {
            if (unregister) unregister();
        };
    }, [handler]);
};