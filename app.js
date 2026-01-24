class TextEditor {
    constructor() {
        this.editor = document.getElementById('editor');
        this.shareBtn = document.getElementById('shareBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.status = document.getElementById('status');
        this.charCount = document.getElementById('charCount');
        this.wordCount = document.getElementById('wordCount');
        this.syncStatus = document.getElementById('syncStatus');
        this.syncIndicator = document.getElementById('syncIndicator');
        this.syncText = document.getElementById('syncText');
        
        this.debounceTimer = null;
        this.syncTimer = null;
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.roomId = null;
        this.isUpdatingFromSync = false;
        this.lastSyncedText = '';
        this.debugMode = true; // Включить отладку
        
        this.init();
    }
    
    debug(...args) {
        if (this.debugMode) {
            console.log(`[DEBUG ${this.isHost ? 'HOST' : 'CLIENT'}]`, ...args);
        }
    }
    
    init() {
        this.debug('Инициализация редактора');
        
        // Проверить наличие roomId в URL
        this.loadRoomFromURL();
        
        // Загрузить текст из localStorage (для быстрого отображения)
        if (this.roomId) {
            this.loadFromStorage();
        }
        
        // Слушать изменения в редакторе
        this.editor.addEventListener('input', () => {
            this.onTextChange();
        });
        
        // Кнопка копирования ссылки
        this.shareBtn.addEventListener('click', () => {
            this.copyLink();
        });
        
        // Кнопка очистки
        this.clearBtn.addEventListener('click', () => {
            this.clearText();
        });
        
        // Сохранять текст перед закрытием страницы
        window.addEventListener('beforeunload', () => {
            this.saveToStorage();
        });
        
        // Инициализировать синхронизацию
        this.initSync();
        
        // Обновить счетчики
        this.updateCounters();
        
        // Запустить периодическую синхронизацию
        this.startPeriodicSync();
    }
    
    // Загрузить roomId из URL
    loadRoomFromURL() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        const textParam = params.get('text');
        
        if (roomId) {
            this.roomId = roomId;
            this.debug('Загружен roomId из URL:', roomId);
            
            // Загрузить текст из URL если есть
            if (textParam) {
                try {
                    const decodedText = atob(textParam);
                    if (decodedText && decodedText !== this.editor.value) {
                        this.editor.value = decodedText;
                        this.updateCounters();
                        this.debug('Загружен текст из URL:', decodedText.length, 'символов');
                    }
                } catch (e) {
                    this.debug('Ошибка декодирования текста из URL');
                }
            }
            
            // Проверить статус хоста из localStorage
            try {
                const storageKey = `text-editor-${roomId}`;
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const data = JSON.parse(saved);
                    this.isHost = data.isHost === true;
                    this.debug('Статус из localStorage:', this.isHost ? 'HOST' : 'CLIENT');
                } else {
                    this.isHost = false;
                    this.debug('Нет записи в localStorage, статус: CLIENT');
                }
            } catch (e) {
                this.isHost = false;
                this.debug('Ошибка чтения localStorage, статус: CLIENT');
            }
        } else {
            this.debug('Нет roomId в URL, будет создан новый');
        }
    }
    
    // Обновить URL с roomId и текстом
    updateURL(includeText = false) {
        if (!this.roomId) return;
        
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('room', this.roomId);
        
        // Добавить текст в URL если нужно или если WebRTC не работает
        if (includeText || this.connections.length === 0) {
            const text = this.editor.value;
            if (text && text.length < 1000) { // Ограничение длины URL
                try {
                    const encodedText = btoa(text);
                    url.searchParams.set('text', encodedText);
                } catch (e) {
                    this.debug('Ошибка кодирования текста в base64');
                }
            }
        }
        
        if (window.location.search !== url.search) {
            window.history.replaceState({}, '', url);
            this.debug('URL обновлен:', url.href);
        }
    }
    
    // Обработчик изменения текста
    onTextChange() {
        const text = this.editor.value;
        
        // Обновить счетчики
        this.updateCounters();
        
        // Сохранить в localStorage
        this.saveToStorage();
        
        // Обновить URL с текстом (резервная синхронизация)
        this.updateURL(true);
        
        // Синхронизировать через WebRTC
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            if (!this.isUpdatingFromSync && text !== this.lastSyncedText) {
                this.syncTextToPeers(text);
                this.lastSyncedText = text;
            }
        }, 300);
    }
    
    // Обновить счетчики символов и слов
    updateCounters() {
        const text = this.editor.value;
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        
        this.charCount.textContent = `${chars.toLocaleString()} символов`;
        this.wordCount.textContent = `${words.toLocaleString()} слов`;
    }
    
    // Копировать ссылку в буфер обмена
    async copyLink() {
        // Обновить URL с текущим текстом
        this.updateURL(true);
        const url = window.location.href;
        
        try {
            await navigator.clipboard.writeText(url);
            this.showStatus('✅ Ссылка скопирована! Откройте на другом устройстве');
        } catch (e) {
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showStatus('✅ Ссылка скопирована! Откройте на другом устройстве');
            } catch (err) {
                this.showStatus('❌ Ошибка копирования');
            }
            document.body.removeChild(textArea);
        }
    }
    
    // Показать статус
    showStatus(message) {
        this.status.textContent = message;
        this.status.classList.add('show');
        setTimeout(() => {
            this.status.classList.remove('show');
        }, 2000);
    }
    
    // Очистить текст
    clearText() {
        if (confirm('Вы уверены, что хотите очистить весь текст?')) {
            this.editor.value = '';
            this.updateCounters();
            this.saveToStorage();
            this.syncTextToPeers('');
            this.lastSyncedText = '';
        }
    }
    
    // Сохранить текст в localStorage
    saveToStorage() {
        if (!this.roomId) return;
        
        try {
            const storageKey = `text-editor-${this.roomId}`;
            const data = {
                text: this.editor.value,
                timestamp: Date.now(),
                isHost: this.isHost,
                roomId: this.roomId
            };
            localStorage.setItem(storageKey, JSON.stringify(data));
            this.debug('Сохранено в localStorage:', this.editor.value.length, 'символов');
        } catch (e) {
            console.error('Ошибка сохранения в localStorage:', e);
        }
    }
    
    // Загрузить текст из localStorage
    loadFromStorage() {
        if (!this.roomId) return;
        
        try {
            const storageKey = `text-editor-${this.roomId}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.text !== undefined && data.text !== null) {
                    // Загрузить только если редактор пустой
                    if (!this.editor.value || this.editor.value.trim() === '') {
                        this.editor.value = data.text;
                        this.lastSyncedText = data.text;
                        this.updateCounters();
                        this.debug('Загружено из localStorage:', data.text.length, 'символов');
                    }
                }
            }
        } catch (e) {
            console.error('Ошибка загрузки из localStorage:', e);
        }
    }
    
    // Инициализация синхронизации через WebRTC
    async initSync() {
        try {
            if (typeof Peer !== 'undefined') {
                await this.initPeerJS();
            } else {
                this.updateSyncStatus('error', 'WebRTC недоступен');
                console.error('PeerJS не загружен');
            }
        } catch (e) {
            console.error('Ошибка инициализации синхронизации:', e);
            this.updateSyncStatus('error', 'Ошибка синхронизации');
        }
    }
    
    // Генерация уникального ID комнаты
    generateRoomId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    // Инициализация PeerJS для синхронизации между устройствами
    async initPeerJS() {
        try {
            const params = new URLSearchParams(window.location.search);
            const roomParam = params.get('room');
            
            if (roomParam && !this.isHost) {
                // КЛИЕНТ: подключаемся к существующей комнате
                this.roomId = roomParam;
                this.isHost = false;
                this.debug('Инициализация как КЛИЕНТ, roomId:', roomParam);
                
                this.peer = new Peer({
                    host: '0.peerjs.com',
                    port: 443,
                    path: '/',
                    secure: true,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    }
                });
                
                this.peer.on('open', (id) => {
                    this.debug('Peer открыт (клиент), ID:', id);
                    this.updateSyncStatus('syncing', 'Подключение к хосту...');
                    
                    // Подключиться к хосту
                    const conn = this.peer.connect(this.roomId, {
                        reliable: true
                    });
                    this.setupConnection(conn);
                    
                    // Повторная попытка через 3 секунды если не подключились
                    setTimeout(() => {
                        if (this.connections.length === 0) {
                            this.debug('Повторное подключение...');
                            this.updateSyncStatus('syncing', 'Повторное подключение...');
                            const retryConn = this.peer.connect(this.roomId, {
                                reliable: true
                            });
                            this.setupConnection(retryConn);
                        }
                    }, 3000);
                });
                
            } else {
                // ХОСТ: создаем новую комнату
                this.isHost = true;
                
                if (!this.roomId) {
                    this.roomId = this.generateRoomId();
                }
                
                this.debug('Инициализация как ХОСТ, roomId:', this.roomId);
                
                this.peer = new Peer(this.roomId, {
                    host: '0.peerjs.com',
                    port: 443,
                    path: '/',
                    secure: true,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' }
                        ]
                    }
                });
                
                this.peer.on('open', (id) => {
                    this.debug('Peer открыт (хост), ID:', id);
                    this.roomId = id; // Использовать реальный ID от сервера
                    this.isHost = true;
                    this.updateURL();
                    this.saveToStorage();
                    this.updateSyncStatus('syncing', 'Ожидание подключений...');
                    
                    // Слушать входящие подключения
                    this.peer.on('connection', (conn) => {
                        this.debug('Новое входящее подключение');
                        this.setupConnection(conn);
                    });
                });
            }
            
            this.peer.on('error', (err) => {
                this.debug('PeerJS ошибка:', err.type, err.message);
                
                if (err.type === 'peer-unavailable' || err.type === 'unavailable-id') {
                    // ID занят - попробовать подключиться как клиент
                    if (this.isHost && this.roomId) {
                        this.debug('ID занят, переключение на клиент');
                        this.isHost = false;
                        const conn = this.peer.connect(this.roomId, {
                            reliable: true
                        });
                        this.setupConnection(conn);
                    }
                } else {
                    this.updateSyncStatus('error', 'Ошибка подключения');
                }
            });
            
        } catch (e) {
            console.error('Ошибка инициализации PeerJS:', e);
            this.updateSyncStatus('error', 'Ошибка инициализации');
        }
    }
    
    // Настройка соединения для обмена данными
    setupConnection(conn) {
        this.debug('Настройка соединения, isHost:', this.isHost);
        
        conn.on('open', () => {
            this.debug('Соединение открыто');
            this.connections.push(conn);
            this.updateSyncStatus('synced', 'Синхронизировано');
            
            if (!this.isHost) {
                // КЛИЕНТ: запросить текст у хоста
                this.debug('Клиент запрашивает текст у хоста');
                setTimeout(() => {
                    conn.send({ type: 'request-text' });
                    this.updateSyncStatus('syncing', 'Загрузка текста...');
                }, 200);
            } else {
                // ХОСТ: отправить текст клиенту
                this.debug('Хост отправляет текст клиенту');
                setTimeout(() => {
                    const currentText = this.editor.value || this.getStoredText();
                    if (currentText !== undefined) {
                        this.sendTextUpdate(currentText);
                        this.debug('Текст отправлен клиенту:', currentText.length, 'символов');
                    }
                }, 300);
            }
        });
        
        conn.on('data', (data) => {
            this.debug('Получены данные:', data.type);
            
            if (data.type === 'text-update') {
                this.isUpdatingFromSync = true;
                const receivedText = data.text || '';
                this.debug('Получен текст:', receivedText.length, 'символов');
                
                if (receivedText !== this.editor.value) {
                    this.editor.value = receivedText;
                    this.lastSyncedText = receivedText;
                    this.updateCounters();
                    this.debug('Текст обновлен в редакторе');
                }
                
                this.saveToStorage();
                this.updateSyncStatus('synced', 'Синхронизировано');
                
                setTimeout(() => {
                    this.isUpdatingFromSync = false;
                }, 100);
                
            } else if (data.type === 'request-text') {
                // Хост отправляет текст по запросу
                this.debug('Получен запрос текста от клиента');
                const currentText = this.editor.value || this.getStoredText();
                if (currentText !== undefined) {
                    this.sendTextUpdate(currentText);
                    this.debug('Текст отправлен по запросу:', currentText.length, 'символов');
                }
            }
        });
        
        conn.on('close', () => {
            this.debug('Соединение закрыто');
            this.connections = this.connections.filter(c => c !== conn);
            
            if (this.connections.length === 0) {
                this.updateSyncStatus('syncing', 'Переподключение...');
                
                if (!this.isHost && this.roomId) {
                    setTimeout(() => {
                        this.reconnect();
                    }, 2000);
                }
            }
        });
        
        conn.on('error', (err) => {
            this.debug('Ошибка соединения:', err);
            console.error('Ошибка соединения:', err);
        });
    }
    
    // Получить сохраненный текст из localStorage
    getStoredText() {
        if (!this.roomId) return '';
        
        try {
            const storageKey = `text-editor-${this.roomId}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                return data.text || '';
            }
        } catch (e) {
            console.error('Ошибка чтения из localStorage:', e);
        }
        return '';
    }
    
    // Отправить обновление текста всем подключенным устройствам
    sendTextUpdate(text) {
        const textToSend = text || this.editor.value || this.getStoredText() || '';
        
        if (textToSend === undefined) {
            this.debug('Попытка отправить undefined текст');
            return;
        }
        
        this.debug('Отправка текста', this.connections.length, 'подключениям:', textToSend.length, 'символов');
        
        this.connections.forEach((conn, index) => {
            if (conn.open) {
                try {
                    conn.send({
                        type: 'text-update',
                        text: textToSend,
                        timestamp: Date.now()
                    });
                    this.debug(`Текст отправлен подключению ${index + 1}`);
                } catch (e) {
                    this.debug('Ошибка отправки текста:', e);
                    console.error('Ошибка отправки текста:', e);
                }
            } else {
                this.debug(`Подключение ${index + 1} не открыто`);
            }
        });
    }
    
    // Синхронизировать текст с другими устройствами через WebRTC
    syncTextToPeers(text) {
        if (this.isUpdatingFromSync) {
            return;
        }
        
        this.saveToStorage();
        
        if (this.connections.length > 0) {
            this.sendTextUpdate(text);
            this.updateSyncStatus('syncing', 'Синхронизация...');
            setTimeout(() => {
                this.updateSyncStatus('synced', 'Синхронизировано');
            }, 500);
        } else if (this.isHost) {
            this.updateSyncStatus('syncing', 'Синхронизация через URL (ожидание WebRTC)');
        } else {
            this.updateSyncStatus('syncing', 'Синхронизация через URL (подключение...)');
        }
    }
    
    // Периодическая синхронизация
    startPeriodicSync() {
        // Синхронизировать каждые 5 секунд если есть соединения
        this.syncTimer = setInterval(() => {
            if (this.connections.length > 0 && !this.isUpdatingFromSync) {
                const currentText = this.editor.value;
                if (currentText !== this.lastSyncedText) {
                    this.debug('Периодическая синхронизация');
                    this.syncTextToPeers(currentText);
                    this.lastSyncedText = currentText;
                }
                
                // Клиент периодически запрашивает текст у хоста
                if (!this.isHost) {
                    this.connections.forEach(conn => {
                        if (conn.open) {
                            try {
                                conn.send({ type: 'request-text' });
                            } catch (e) {
                                this.debug('Ошибка запроса текста:', e);
                            }
                        }
                    });
                }
            } else {
                // Если WebRTC не работает, проверяем URL на изменения
                this.checkURLForChanges();
            }
        }, 5000);
    }
    
    // Проверить URL на изменения текста
    checkURLForChanges() {
        const params = new URLSearchParams(window.location.search);
        const textParam = params.get('text');
        
        if (textParam) {
            try {
                const decodedText = atob(textParam);
                if (decodedText && decodedText !== this.editor.value && decodedText !== this.lastSyncedText) {
                    this.isUpdatingFromSync = true;
                    this.editor.value = decodedText;
                    this.lastSyncedText = decodedText;
                    this.updateCounters();
                    this.debug('Обновлен текст из URL:', decodedText.length, 'символов');
                    
                    setTimeout(() => {
                        this.isUpdatingFromSync = false;
                    }, 100);
                }
            } catch (e) {
                this.debug('Ошибка декодирования текста из URL при проверке');
            }
        }
    }
    
    // Переподключиться к хосту
    reconnect() {
        if (!this.roomId || this.isHost) return;
        
        this.debug('Попытка переподключения');
        
        try {
            if (this.peer && !this.peer.destroyed) {
                const conn = this.peer.connect(this.roomId, {
                    reliable: true
                });
                this.setupConnection(conn);
            } else {
                // Пересоздать Peer если он уничтожен
                this.initPeerJS();
            }
        } catch (e) {
            this.debug('Ошибка переподключения:', e);
            console.error('Ошибка переподключения:', e);
        }
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        
        // Добавить информацию о типе синхронизации
        let statusText = text;
        if (this.connections.length === 0 && this.roomId) {
            statusText += ' • URL-синхронизация активна';
        }
        
        this.syncText.textContent = statusText;
        this.debug('Статус обновлен:', status, statusText);
    }
}

// Инициализировать редактор при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new TextEditor();
});
