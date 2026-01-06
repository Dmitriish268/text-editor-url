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
        this.syncChannel = null;
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.roomId = null;
        this.isUpdatingFromSync = false;
        
        this.init();
    }
    
    init() {
        // Загрузить текст из URL при загрузке страницы
        this.loadFromURL();
        
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
        
        // Слушать изменения URL (для синхронизации при открытии ссылки)
        window.addEventListener('popstate', () => {
            this.loadFromURL();
        });
        
        // Инициализировать синхронизацию
        this.initSync();
        
        // Обновить счетчики
        this.updateCounters();
    }
    
    // Кодирование текста в base64 для URL
    encodeText(text) {
        try {
            return btoa(encodeURIComponent(text));
        } catch (e) {
            console.error('Ошибка кодирования:', e);
            return '';
        }
    }
    
    // Декодирование текста из base64
    decodeText(encoded) {
        try {
            return decodeURIComponent(atob(encoded));
        } catch (e) {
            console.error('Ошибка декодирования:', e);
            return '';
        }
    }
    
    // Загрузить текст из URL
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const textParam = params.get('text');
        
        if (textParam) {
            const text = this.decodeText(textParam);
            if (text !== this.editor.value) {
                this.editor.value = text;
                this.updateCounters();
            }
        }
        
        // Проверить наличие roomId для синхронизации
        const roomId = params.get('room');
        if (roomId && roomId !== this.roomId) {
            this.roomId = roomId;
            this.initSync();
        }
    }
    
    // Обновить URL при изменении текста
    updateURL(text) {
        const encoded = this.encodeText(text);
        const url = new URL(window.location.href);
        url.searchParams.set('text', encoded);
        
        // Сохранить roomId если есть
        if (this.roomId) {
            url.searchParams.set('room', this.roomId);
        }
        
        // Обновить URL без перезагрузки страницы
        window.history.replaceState({}, '', url);
    }
    
    // Обработчик изменения текста
    onTextChange() {
        const text = this.editor.value;
        
        // Обновить счетчики
        this.updateCounters();
        
        // Обновить URL с задержкой (debounce)
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.updateURL(text);
            // Синхронизировать только если изменение не пришло от синхронизации
            if (!this.isUpdatingFromSync) {
                this.syncTextToPeers(text);
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
        const url = window.location.href;
        
        try {
            await navigator.clipboard.writeText(url);
            this.showStatus('✅ Ссылка скопирована!');
        } catch (e) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showStatus('✅ Ссылка скопирована!');
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
            this.updateURL('');
            this.syncTextToPeers('');
        }
    }
    
    // Инициализация синхронизации через WebRTC
    async initSync() {
        try {
            // Использовать BroadcastChannel для синхронизации в рамках одного браузера
            this.initBroadcastChannel();
            
            // Использовать PeerJS для синхронизации между устройствами
            if (typeof Peer !== 'undefined') {
                await this.initPeerJS();
            } else {
                // Fallback: только localStorage синхронизация
                const params = new URLSearchParams(window.location.search);
                const roomParam = params.get('room');
                if (roomParam) {
                    this.roomId = roomParam;
                    this.isHost = false;
                } else {
                    this.roomId = this.generateRoomId();
                    this.isHost = true;
                    this.updateURL(this.editor.value);
                }
                this.initLocalStorageSync();
            }
            
            this.updateSyncStatus('synced', 'Синхронизировано');
        } catch (e) {
            console.error('Ошибка инициализации синхронизации:', e);
            this.updateSyncStatus('error', 'Ошибка синхронизации');
            // Fallback на localStorage
            const params = new URLSearchParams(window.location.search);
            const roomParam = params.get('room');
            if (roomParam) {
                this.roomId = roomParam;
                this.isHost = false;
            } else {
                this.roomId = this.generateRoomId();
                this.isHost = true;
            }
            this.initLocalStorageSync();
        }
    }
    
    // Генерация уникального ID комнаты
    generateRoomId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    // Инициализация BroadcastChannel (для синхронизации в рамках одного браузера)
    initBroadcastChannel() {
        if (typeof BroadcastChannel !== 'undefined') {
            this.syncChannel = new BroadcastChannel(`text-editor-${this.roomId}`);
            
            this.syncChannel.onmessage = (event) => {
                if (event.data.type === 'text-update' && event.data.text !== this.editor.value) {
                    this.editor.value = event.data.text;
                    this.updateCounters();
                    this.updateURL(event.data.text);
                }
            };
        }
    }
    
    // Инициализация PeerJS для синхронизации между устройствами
    async initPeerJS() {
        try {
            const params = new URLSearchParams(window.location.search);
            const roomParam = params.get('room');
            
            if (roomParam) {
                // Клиент: подключаемся к существующей комнате
                this.roomId = roomParam;
                this.isHost = false;
                
                // Создать Peer без ID (случайный ID)
                this.peer = new Peer({
                    host: 'peerjs-server.herokuapp.com',
                    port: 443,
                    path: '/',
                    secure: true,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    }
                });
                
                this.peer.on('open', () => {
                    this.updateSyncStatus('syncing', 'Подключение...');
                    const conn = this.peer.connect(this.roomId);
                    this.setupConnection(conn);
                });
            } else {
                // Хост: создаем новую комнату
                this.isHost = true;
                
                // Создать Peer с указанным ID (это будет roomId)
                this.roomId = this.generateRoomId();
                this.peer = new Peer(this.roomId, {
                    host: 'peerjs-server.herokuapp.com',
                    port: 443,
                    path: '/',
                    secure: true,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    }
                });
                
                this.peer.on('open', (id) => {
                    console.log('Peer ID (roomId):', id);
                    this.roomId = id; // Использовать реальный ID от сервера
                    this.updateURL(this.editor.value);
                    this.updateSyncStatus('syncing', 'Ожидание подключений...');
                    
                    // Слушать входящие подключения
                    this.peer.on('connection', (conn) => {
                        this.setupConnection(conn);
                        // Отправить текущий текст новому подключению
                        setTimeout(() => {
                            this.sendTextUpdate(this.editor.value);
                        }, 500);
                    });
                });
            }
            
            this.peer.on('error', (err) => {
                console.error('PeerJS ошибка:', err);
                // Если ошибка "ID занят", значит мы клиент и хост уже существует
                if (err.type === 'peer-unavailable' || err.type === 'unavailable-id') {
                    // Попробовать подключиться как клиент
                    if (this.isHost) {
                        this.isHost = false;
                        const conn = this.peer.connect(this.roomId);
                        this.setupConnection(conn);
                    }
                } else {
                    // Fallback на localStorage синхронизацию
                    this.initLocalStorageSync();
                }
            });
            
        } catch (e) {
            console.error('Ошибка инициализации PeerJS:', e);
            this.initLocalStorageSync();
        }
    }
    
    // Настройка соединения для обмена данными
    setupConnection(conn) {
        conn.on('open', () => {
            console.log('Соединение установлено');
            this.connections.push(conn);
            this.updateSyncStatus('synced', 'Синхронизировано');
            
            // Если мы клиент, запросить текущий текст
            if (!this.isHost) {
                conn.send({ type: 'request-text' });
            }
        });
        
        conn.on('data', (data) => {
            if (data.type === 'text-update') {
                this.isUpdatingFromSync = true;
                if (data.text !== this.editor.value) {
                    this.editor.value = data.text;
                    this.updateCounters();
                    this.updateURL(data.text);
                }
                setTimeout(() => {
                    this.isUpdatingFromSync = false;
                }, 100);
            } else if (data.type === 'request-text') {
                // Отправить текущий текст по запросу
                this.sendTextUpdate(this.editor.value);
            }
        });
        
        conn.on('close', () => {
            this.connections = this.connections.filter(c => c !== conn);
            if (this.connections.length === 0) {
                this.updateSyncStatus('syncing', 'Переподключение...');
            }
        });
        
        conn.on('error', (err) => {
            console.error('Ошибка соединения:', err);
        });
    }
    
    // Отправить обновление текста всем подключенным устройствам
    sendTextUpdate(text) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'text-update',
                    text: text,
                    timestamp: Date.now()
                });
            }
        });
    }
    
    // Инициализация синхронизации через localStorage (fallback)
    initLocalStorageSync() {
        if (typeof Storage !== 'undefined') {
            const storageKey = `text-editor-${this.roomId}`;
            
            // Загрузить текст из localStorage при старте
            const saved = localStorage.getItem(storageKey);
            if (saved && !this.isHost) {
                try {
                    const data = JSON.parse(saved);
                    if (data.text && data.text !== this.editor.value) {
                        this.editor.value = data.text;
                        this.updateCounters();
                        this.updateURL(data.text);
                    }
                } catch (err) {
                    console.error('Ошибка парсинга данных:', err);
                }
            }
            
            // Слушать изменения в localStorage
            window.addEventListener('storage', (e) => {
                if (e.key === storageKey && e.newValue) {
                    try {
                        const data = JSON.parse(e.newValue);
                        if (data.text !== this.editor.value) {
                            this.isUpdatingFromSync = true;
                            this.editor.value = data.text;
                            this.updateCounters();
                            this.updateURL(data.text);
                            setTimeout(() => {
                                this.isUpdatingFromSync = false;
                            }, 100);
                        }
                    } catch (err) {
                        console.error('Ошибка парсинга данных:', err);
                    }
                }
            });
            
            // Периодически проверять обновления (polling)
            setInterval(() => {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    try {
                        const data = JSON.parse(saved);
                        if (data.text !== this.editor.value && data.timestamp > (this.lastSyncTimestamp || 0)) {
                            this.isUpdatingFromSync = true;
                            this.editor.value = data.text;
                            this.updateCounters();
                            this.updateURL(data.text);
                            this.lastSyncTimestamp = data.timestamp;
                            setTimeout(() => {
                                this.isUpdatingFromSync = false;
                            }, 100);
                        }
                    } catch (err) {
                        // Игнорировать ошибки
                    }
                }
            }, 1000);
        }
    }
    
    // Синхронизировать текст с другими устройствами
    syncTextToPeers(text) {
        // Не синхронизировать, если обновление пришло от синхронизации
        if (this.isUpdatingFromSync) {
            return;
        }
        
        // Отправить через BroadcastChannel (для синхронизации в рамках одного браузера)
        if (this.syncChannel) {
            this.syncChannel.postMessage({
                type: 'text-update',
                text: text,
                timestamp: Date.now()
            });
        }
        
        // Отправить через PeerJS соединения (для синхронизации между устройствами)
        if (this.connections.length > 0) {
            this.sendTextUpdate(text);
        }
        
        // Сохранить в localStorage для синхронизации между вкладками (fallback)
        if (typeof Storage !== 'undefined') {
            const storageKey = `text-editor-${this.roomId}`;
            try {
                const data = {
                    text: text,
                    timestamp: Date.now()
                };
                localStorage.setItem(storageKey, JSON.stringify(data));
                this.lastSyncTimestamp = data.timestamp;
            } catch (e) {
                // Игнорировать ошибки (например, если localStorage заполнен)
            }
        }
        
        this.updateSyncStatus('syncing', 'Синхронизация...');
        setTimeout(() => {
            this.updateSyncStatus('synced', 'Синхронизировано');
        }, 500);
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        this.syncText.textContent = text;
    }
}

// Инициализировать редактор при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new TextEditor();
});

