"use client";
import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

export type SnackbarType = 'success' | 'error' | 'warning' | 'info';

interface SnackbarProps {
    message: string;
    type: SnackbarType;
    isVisible: boolean;
    onClose: () => void;
    duration?: number;
}

export default function Snackbar({ message, type, isVisible, onClose, duration = 5000 }: SnackbarProps) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShow(true);
            const timer = setTimeout(() => {
                setShow(false);
                setTimeout(onClose, 300); // Wait for fade out
            }, duration);
            return () => clearTimeout(timer);
        } else {
            setShow(false);
        }
    }, [isVisible, duration, onClose]);

    if (!isVisible && !show) return null;

    const bgColors = {
        success: 'bg-green-600/90 border-green-500/50',
        error: 'bg-red-600/90 border-red-500/50',
        warning: 'bg-amber-500/90 border-amber-400/50',
        info: 'bg-blue-600/90 border-blue-500/50'
    };

    const icons = {
        success: <CheckCircle className="w-5 h-5 text-white" />,
        error: <AlertCircle className="w-5 h-5 text-white" />,
        warning: <AlertTriangle className="w-5 h-5 text-white" />,
        info: <Info className="w-5 h-5 text-white" />
    };

    return (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] transition-all duration-300 ease-in-out ${show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl ${bgColors[type]} min-w-[320px] max-w-md`}>
                <div className="flex-shrink-0">
                    {icons[type]}
                </div>
                <p className="flex-grow text-white font-medium text-sm">{message}</p>
                <button
                    onClick={() => setShow(false)}
                    className="flex-shrink-0 text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
