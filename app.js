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
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.roomId = null;
        this.isUpdatingFromSync = false;
        
        this.init();
    }
    
    init() {
        // Проверить наличие roomId в URL
        this.loadRoomFromURL();
        
        // Если это клиент (есть roomId в URL), загрузить из localStorage только для быстрого отображения
        // Актуальный текст будет запрошен у хоста через WebRTC
        if (this.roomId && !this.isHost) {
            this.loadFromStorage();
        } else if (this.isHost) {
            // Если это хост, загрузить из localStorage
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
    }
    
    // Загрузить roomId из URL
    loadRoomFromURL() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        
        if (roomId) {
            this.roomId = roomId;
            this.isHost = false;
        }
    }
    
    // Обновить URL только с roomId (ссылка не меняется)
    updateURL() {
        if (!this.roomId) return;
        
        const url = new URL(window.location.href);
        // Удалить все параметры
        url.search = '';
        // Добавить только roomId
        url.searchParams.set('room', this.roomId);
        
        // Обновить URL без перезагрузки страницы (только один раз при создании комнаты)
        if (window.location.search !== url.search) {
            window.history.replaceState({}, '', url);
        }
    }
    
    // Обработчик изменения текста
    onTextChange() {
        const text = this.editor.value;
        
        // Обновить счетчики
        this.updateCounters();
        
        // Сохранить в localStorage
        this.saveToStorage();
        
        // Синхронизировать только через WebRTC (не через URL)
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
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
            this.saveToStorage();
            this.syncTextToPeers('');
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
                isHost: this.isHost
            };
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch (e) {
            console.error('Ошибка сохранения в localStorage:', e);
        }
    }
    
    // Загрузить текст из localStorage (только для быстрого отображения)
    loadFromStorage() {
        if (!this.roomId) return;
        
        try {
            const storageKey = `text-editor-${this.roomId}`;
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.text !== undefined && data.text !== null) {
                    // Загрузить только если редактор пустой (не перезаписывать если уже есть текст)
                    if (!this.editor.value || this.editor.value.trim() === '') {
                        this.editor.value = data.text;
                        this.updateCounters();
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
            // Использовать только PeerJS для синхронизации между устройствами
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
                    this.updateSyncStatus('syncing', 'Подключение к хосту...');
                    const conn = this.peer.connect(this.roomId);
                    this.setupConnection(conn);
                    
                    // Если соединение не установилось за 3 секунды, попробовать еще раз
                    setTimeout(() => {
                        if (this.connections.length === 0) {
                            this.updateSyncStatus('syncing', 'Повторное подключение...');
                            const retryConn = this.peer.connect(this.roomId);
                            this.setupConnection(retryConn);
                        }
                    }, 3000);
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
                    this.updateURL(); // Обновить URL только с roomId
                    this.updateSyncStatus('syncing', 'Ожидание подключений...');
                    
                    // Слушать входящие подключения
                    this.peer.on('connection', (conn) => {
                        this.setupConnection(conn);
                        // Хост автоматически отправит текст через setupConnection
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
        conn.on('open', () => {
            console.log('Соединение установлено');
            this.connections.push(conn);
            this.updateSyncStatus('synced', 'Синхронизировано');
            
            // Если мы клиент, ОБЯЗАТЕЛЬНО запросить актуальный текст у хоста
            if (!this.isHost) {
                // Запросить актуальный текст у хоста (не полагаться на localStorage)
                setTimeout(() => {
                    conn.send({ type: 'request-text' });
                    this.updateSyncStatus('syncing', 'Загрузка текста...');
                }, 100);
            } else {
                // Если мы хост, отправить актуальный текст сразу всем подключенным клиентам
                setTimeout(() => {
                    const currentText = this.editor.value || this.getStoredText();
                    if (currentText) {
                        this.sendTextUpdate(currentText);
                    }
                }, 200);
            }
        });
        
        conn.on('data', (data) => {
            if (data.type === 'text-update') {
                this.isUpdatingFromSync = true;
                // Всегда обновлять текст, даже если он совпадает (на случай обновления страницы)
                const receivedText = data.text || '';
                if (receivedText !== this.editor.value) {
                    this.editor.value = receivedText;
                    this.updateCounters();
                }
                // Сохранить полученный текст в localStorage (глобальная синхронизация)
                this.saveToStorage();
                this.updateSyncStatus('synced', 'Синхронизировано');
                setTimeout(() => {
                    this.isUpdatingFromSync = false;
                }, 100);
            } else if (data.type === 'request-text') {
                // Хост отправляет актуальный текст по запросу клиента
                const currentText = this.editor.value || this.getStoredText();
                if (currentText) {
                    this.sendTextUpdate(currentText);
                }
            }
        });
        
        conn.on('close', () => {
            this.connections = this.connections.filter(c => c !== conn);
            if (this.connections.length === 0) {
                this.updateSyncStatus('syncing', 'Переподключение...');
                // При потере соединения попробовать переподключиться
                if (!this.isHost && this.roomId) {
                    setTimeout(() => {
                        this.reconnect();
                    }, 2000);
                }
            }
        });
        
        conn.on('error', (err) => {
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
        const textToSend = text || this.editor.value || this.getStoredText();
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'text-update',
                    text: textToSend,
                    timestamp: Date.now()
                });
            }
        });
    }
    
    // Синхронизировать текст с другими устройствами через WebRTC
    syncTextToPeers(text) {
        // Не синхронизировать, если обновление пришло от синхронизации
        if (this.isUpdatingFromSync) {
            return;
        }
        
        // Сохранить в localStorage перед синхронизацией
        this.saveToStorage();
        
        // Отправить только через PeerJS соединения (синхронизация между устройствами)
        if (this.connections.length > 0) {
            this.sendTextUpdate(text);
            this.updateSyncStatus('syncing', 'Синхронизация...');
            setTimeout(() => {
                this.updateSyncStatus('synced', 'Синхронизировано');
            }, 500);
        } else if (this.isHost) {
            // Хост еще не подключен, но готов принимать подключения
            this.updateSyncStatus('syncing', 'Ожидание подключений...');
        } else {
            // Клиент еще не подключен
            this.updateSyncStatus('syncing', 'Подключение...');
        }
    }
    
    // Переподключиться к хосту
    reconnect() {
        if (!this.roomId || this.isHost) return;
        
        try {
            if (this.peer && !this.peer.destroyed) {
                const conn = this.peer.connect(this.roomId);
                this.setupConnection(conn);
            }
        } catch (e) {
            console.error('Ошибка переподключения:', e);
        }
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

