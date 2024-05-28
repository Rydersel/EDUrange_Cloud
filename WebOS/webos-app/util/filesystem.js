// utils/fileSystem.js

export class FileSystem {
    constructor() {
        const savedState = JSON.parse(localStorage.getItem('fileSystem'));
        this.root = savedState || {
            type: 'directory',
            name: 'root',
            children: [],
        };
    }

    save() {
        localStorage.setItem('fileSystem', JSON.stringify(this.root));
    }

    create(name, type, path = [], content = '') {
        const target = this.navigate(path);
        if (target && target.type === 'directory') {
            target.children.push({
                type,
                name,
                content: type === 'file' ? content : null,
                children: type === 'directory' ? [] : null,
            });
            this.save();
        }
    }

    read(path) {
        return this.navigate(path);
    }

    update(name, newName, path = []) {
        const target = this.navigate(path);
        if (target) {
            target.name = newName;
            this.save();
        }
    }

    delete(name, path = []) {
        const target = this.navigate(path);
        if (target && target.type === 'directory') {
            target.children = target.children.filter(child => child.name !== name);
            this.save();
        }
    }

    navigate(path) {
        let current = this.root;
        for (const part of path) {
            const next = current.children.find(child => child.name === part);
            if (!next) return null;
            current = next;
        }
        return current;
    }

    uploadFile(name, content, path = []) {
        this.create(name, 'file', path, content);
    }

    downloadFile(path) {
        const file = this.navigate(path);
        if (file && file.type === 'file') {
            const element = document.createElement('a');
            const fileBlob = new Blob([file.content], { type: 'text/plain' });
            element.href = URL.createObjectURL(fileBlob);
            element.download = file.name;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
        }
    }
}

export const fileSystem = new FileSystem();
