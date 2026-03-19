"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';
import Snackbar, { SnackbarType } from '../components/ui/Snackbar';

interface SnackbarContextType {
    show: (message: string, type?: SnackbarType) => void;
    error: (message: string) => void;
    success: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

export function useSnackbar() {
    const context = useContext(SnackbarContext);
    if (!context) {
        throw new Error('useSnackbar must be used within a SnackbarProvider');
    }
    return context;
}

export default function SnackbarProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<{ message: string; type: SnackbarType; isVisible: boolean }>({
        message: '',
        type: 'info',
        isVisible: false,
    });

    const show = (message: string, type: SnackbarType = 'info') => {
        setConfig({ message, type, isVisible: true });
    };

    const error = (message: string) => show(message, 'error');
    const success = (message: string) => show(message, 'success');

    const close = () => {
        setConfig(prev => ({ ...prev, isVisible: false }));
    };

    return (
        <SnackbarContext.Provider value={{ show, error, success }}>
            {children}
            <Snackbar
                message={config.message}
                type={config.type}
                isVisible={config.isVisible}
                onClose={close}
            />
        </SnackbarContext.Provider>
    );
}
