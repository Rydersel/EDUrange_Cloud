// components/FileSystemView.js

import { useState, useEffect } from 'react';
import styles from './FileSystemView.module.css';

const FileSystemView = () => {
    const [currentPath, setCurrentPath] = useState([]);
    const [fileSystemState, setFileSystemState] = useState([]);
    const [refresh, setRefresh] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newItemType, setNewItemType] = useState('');
    const [newItemName, setNewItemName] = useState('');

    useEffect(() => {
        fetchFiles(currentPath);
    }, [currentPath, refresh]);

    const fetchFiles = async (path) => {
        const filePath = path.join('/') || '/';
        try {
            const response = await fetch(`/api/files?filePath=${encodeURIComponent(filePath)}`);
            const data = await response.json();
            console.log("Fetched data:", data);
            if (Array.isArray(data)) {
                setFileSystemState(data);
            } else if (data && typeof data === 'object' && 'content' in data) {
                setFileSystemState([data]);
            } else {
                setFileSystemState([]);
            }
        } catch (error) {
            console.error("Failed to fetch files:", error);
            setFileSystemState([]);
        }
    };

    const createFileOrFolder = async () => {
        const filePath = [...currentPath, newItemName].join('/');
        console.log(`Creating item: ${newItemName}, type: ${newItemType}, filePath: ${filePath}`);
        try {
            const response = await fetch('/api/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath, content: '', type: newItemType }),
            });
            if (response.ok) {
                setRefresh(!refresh);
                setIsModalOpen(false);
                setNewItemName('');
                setNewItemType('');
            } else {
                console.error("Failed to create item:", await response.json());
            }
        } catch (error) {
            console.error("Failed to create item:", error);
        }
    };

    const deleteFile = async (name) => {
        const filePath = [...currentPath, name].join('/');
        console.log(`Deleting item: ${name}, filePath: ${filePath}`);
        try {
            const response = await fetch('/api/files', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath }),
            });
            if (response.ok) {
                setRefresh(!refresh);
            } else {
                console.error("Failed to delete item:", await response.json());
            }
        } catch (error) {
            console.error("Failed to delete item:", error);
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            console.log(`Uploading file: ${file.name}`);
            const reader = new FileReader();
            reader.onload = async (e) => {
                await createFileOrFolder(file.name, 'file', e.target.result);
            };
            reader.readAsText(file);
        }
    };

    const downloadFile = async (name) => {
        const filePath = [...currentPath, name].join('/');
        console.log(`Downloading file: ${name}, filePath: ${filePath}`);
        try {
            const response = await fetch(`/api/files?filePath=${encodeURIComponent(filePath)}`);
            const data = await response.json();
            const element = document.createElement('a');
            const fileBlob = new Blob([data.content], { type: 'text/plain' });
            element.href = URL.createObjectURL(fileBlob);
            element.download = name;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        } catch (error) {
            console.error("Failed to download file:", error);
        }
    };

    const openModal = (type) => {
        setNewItemType(type);
        setIsModalOpen(true);
    };

    const navigateToFolder = (folderName) => {
        setCurrentPath([...currentPath, folderName]);
    };

    const goBack = () => {
        if (currentPath.length > 0) {
            setCurrentPath(currentPath.slice(0, -1));
        }
    };

    return (
        <div className={styles.container}>
            <h1>File System</h1>
            <div className={styles.header}>
                <div className={styles.path}>
                    Path: {currentPath.join('/') || 'root'}
                </div>
                <button className={styles.button} onClick={() => setCurrentPath([])}>Go to root</button>
                {currentPath.length > 0 && (
                    <button className={styles.button} onClick={goBack}>Go Back</button>
                )}
            </div>
            <div className={styles.fileSystem}>
                {Array.isArray(fileSystemState) && fileSystemState.length > 0 ? (
                    fileSystemState.map((child) => (
                        <div key={child.name} className={styles.fileItem}>
                            <span onClick={() => child.type === 'directory' && navigateToFolder(child.name)}>
                                {child.type === 'directory' ? '📁' : '📄'} {child.name}
                            </span>
                            {child.type === 'file' && (
                                <button className={styles.button} onClick={() => downloadFile(child.name)}>Download</button>
                            )}
                            <button onClick={() => deleteFile(child.name)}>Delete</button>
                        </div>
                    ))
                ) : (
                    <div>No files or directories found.</div>
                )}
            </div>
            <div className={styles.actionButtons}>
                <button className={styles.button} onClick={() => openModal('directory')}>New Folder</button>
                <button className={styles.button} onClick={() => openModal('file')}>New File</button>
                <input
                    type="file"
                    onChange={handleFileUpload}
                    className={styles.uploadInput}
                />
            </div>
            {isModalOpen && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <h2>Enter {newItemType === 'directory' ? 'Folder' : 'File'} Name</h2>
                        <input
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                        />
                        <button onClick={createFileOrFolder}>Create</button>
                        <button onClick={() => setIsModalOpen(false)}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileSystemView;
