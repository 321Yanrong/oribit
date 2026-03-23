import React, { useState } from 'react';

const ReportModal = ({ isOpen, onClose, onSubmit }: { isOpen: boolean; onClose: () => void; onSubmit: (reason: string) => void }) => {
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (reason) {
            onSubmit(reason);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 w-96">
                <h2 className="text-lg font-bold mb-4">举报用户</h2>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="请输入举报原因..."
                    className="w-full border rounded-md p-2 mb-4"
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded-md">取消</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-red-500 text-white rounded-md">提交</button>
                </div>
            </div>
        </div>
    );
};

export default ReportModal;