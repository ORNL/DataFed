import React, { useEffect, useState } from 'react';
import { DataRecord } from '../../types/models';
import dataFedApi from '../../services/api';

interface DataRecordViewProps {
    recordId: string;
    onEdit?: (record: DataRecord) => void;
    onDelete?: (recordId: string) => void;
}

/**
 * Component for displaying a data record
 */
const DataRecordView: React.FC<DataRecordViewProps> = ({ recordId, onEdit, onDelete }) => {
    const [record, setRecord] = useState<DataRecord | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecord = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await dataFedApi.getDataRecord(recordId);

                if (response.success && response.data) {
                    setRecord(response.data);
                } else {
                    setError(response.error || 'Failed to load record');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
            } finally {
                setLoading(false);
            }
        };

        fetchRecord();
    }, [recordId]);

    const handleEdit = () => {
        if (record && onEdit) {
            onEdit(record);
        }
    };

    const handleDelete = () => {
        if (onDelete) {
            onDelete(recordId);
        }
    };

    if (loading) {
        return <div className="loading">Loading record...</div>;
    }

    if (error) {
        return <div className="error">Error: {error}</div>;
    }

    if (!record) {
        return <div className="not-found">Record not found</div>;
    }

    return (
        <div className="data-record-view">
            <div className="record-header">
                <h2>{record.title}</h2>
                <div className="record-actions">
                    {onEdit && (
                        <button className="btn btn-edit" onClick={handleEdit}>
                            Edit
                        </button>
                    )}
                    {onDelete && (
                        <button className="btn btn-delete" onClick={handleDelete}>
                            Delete
                        </button>
                    )}
                </div>
            </div>

            <div className="record-metadata">
                <div className="metadata-item">
                    <span className="label">ID:</span>
                    <span className="value">{record.id}</span>
                </div>
                <div className="metadata-item">
                    <span className="label">Owner:</span>
                    <span className="value">{record.ownerName || record.owner}</span>
                </div>
                <div className="metadata-item">
                    <span className="label">Created:</span>
                    <span className="value">{new Date(record.createdTime * 1000).toLocaleString()}</span>
                </div>
                <div className="metadata-item">
                    <span className="label">Updated:</span>
                    <span className="value">{new Date(record.updatedTime * 1000).toLocaleString()}</span>
                </div>
                {record.size !== undefined && (
                    <div className="metadata-item">
                        <span className="label">Size:</span>
                        <span className="value">{formatFileSize(record.size)}</span>
                    </div>
                )}
                {record.dataType && (
                    <div className="metadata-item">
                        <span className="label">Type:</span>
                        <span className="value">{record.dataType}</span>
                    </div>
                )}
            </div>

            {record.description && (
                <div className="record-description">
                    <h3>Description</h3>
                    <p>{record.description}</p>
                </div>
            )}

            {record.keywords && record.keywords.length > 0 && (
                <div className="record-keywords">
                    <h3>Keywords</h3>
                    <div className="keyword-list">
                        {record.keywords.map((keyword, index) => (
                            <span key={index} className="keyword">
                {keyword}
              </span>
                        ))}
                    </div>
                </div>
            )}

            {record.metadata && (
                <div className="record-structured-metadata">
                    <h3>Structured Metadata</h3>
                    <pre>{JSON.stringify(record.metadata, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

/**
 * Format file size in human-readable format
 * @param bytes Size in bytes
 * @returns Formatted size string
 */
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default DataRecordView;