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
        this.roomId = null;
        this.lastSyncedText = '';
        this.lastSyncTime = 0;
        this.isUpdating = false;
        this.debugMode = true;
        
        // Используем localStorage + kvdb.io (простой и надежный key-value store)
        this.storageKey = 'texteditor-sync';
        this.serverUrl = 'https://kvdb.io/GHzaKBYVMdWVQRMFYM9Pyc';
        
        // BroadcastChannel для синхронизации между вкладками одного браузера
        this.channel = new BroadcastChannel('text-sync');
        this.channel.onmessage = (event) => {
            if (event.data.roomId === this.roomId && event.data.text !== this.editor.value) {
                this.isUpdating = true;
                this.editor.value = event.data.text;
                this.lastSyncedText = event.data.text;
                this.updateCounters();
                this.updateSyncStatus('synced', '🔄 Обновлено из другой вкладки');
                setTimeout(() => { this.isUpdating = false; }, 100);
            }
        };
        
        this.init();
    }
    
    debug(...args) {
        if (this.debugMode) {
            console.log(`[DEBUG]`, ...args);
        }
    }
    
    init() {
        this.debug('Инициализация редактора');
        
        // Получить roomId из URL или создать новый
        this.initRoom();
        
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
        
        // Обновить счетчики
        this.updateCounters();
        
        // Загрузить данные из localStorage/URL/сервера
        this.loadFromStorage();
        
        // Запустить синхронизацию между устройствами
        this.startSync();
    }
    
    // Инициализация комнаты
    initRoom() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        
        if (roomId) {
            this.roomId = roomId;
            this.debug('Использован roomId из URL:', roomId);
        } else {
            this.roomId = this.generateRoomId();
            this.updateURL();
            this.debug('Создан новый roomId:', this.roomId);
        }
    }
    
    // Обновить URL с roomId
    updateURL() {
        if (!this.roomId) return;
        
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('room', this.roomId);
        
        window.history.replaceState({}, '', url);
        this.debug('URL обновлен');
    }
    
    // Обновить URL с текстом для внешней синхронизации
    updateURLWithText() {
        if (!this.roomId) return;
        
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('room', this.roomId);
        
        const text = this.editor.value;
        if (text && text.length < 2000) { // Ограничение длины URL
            try {
                const encodedText = btoa(encodeURIComponent(text));
                url.searchParams.set('text', encodedText);
            } catch (e) {
                this.debug('Ошибка кодирования текста для URL');
            }
        }
        
        window.history.replaceState({}, '', url);
        this.debug('URL обновлен с текстом');
    }
    
    // Обработчик изменения текста
    onTextChange() {
        if (this.isUpdating) return; // Не обрабатываем изменения во время синхронизации
        
        // Обновить счетчики
        this.updateCounters();
        
        // Показать что идет набор
        this.updateSyncStatus('syncing', '✏️ Набираете...');
        
        // Быстрое сохранение в localStorage
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.saveToStorage();
        }, 100); // Ускорено для быстрой синхронизации
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
        // Сначала сохранить текущий текст на сервер и в URL
        await this.saveToStorage();
        
        const url = window.location.href;
        
        try {
            await navigator.clipboard.writeText(url);
            this.showStatus('✅ Ссылка скопирована! Открывайте на любых устройствах - синхронизируется мгновенно');
        } catch (e) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showStatus('✅ Ссылка скопирована! Открывайте на любых устройствах - синхронизируется мгновенно');
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
        }, 3000);
    }
    
    // Очистить текст
    async clearText() {
        if (confirm('Вы уверены, что хотите очистить весь текст?')) {
            this.editor.value = '';
            this.updateCounters();
            await this.saveToStorage();
        }
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        this.syncText.textContent = text;
        this.debug('Статус:', status, text);
    }
    
    // Загрузить данные из localStorage, URL или сервера
    async loadFromStorage() {
        if (!this.roomId) return;
        
        try {
            // Сначала попробуем загрузить с сервера (самые актуальные данные)
            const serverLoaded = await this.loadFromServer();
            if (serverLoaded) {
                return; // Если загрузили с сервера - готово
            }
            
            // Если сервер недоступен, проверим URL параметры
            const params = new URLSearchParams(window.location.search);
            const textParam = params.get('text');
            
            if (textParam) {
                try {
                    const decodedText = decodeURIComponent(atob(textParam));
                    if (decodedText) {
                        this.editor.value = decodedText;
                        this.lastSyncedText = decodedText;
                        this.debug('Загружен текст из URL:', decodedText.length, 'символов');
                        this.updateCounters();
                        
                        // Сохранить в localStorage и на сервер
                        const data = { text: decodedText, timestamp: Date.now() };
                        localStorage.setItem(`${this.storageKey}-${this.roomId}`, JSON.stringify(data));
                        this.saveToServer(data);
                        
                        this.updateSyncStatus('synced', '🔗 Загружено из ссылки');
                        return;
                    }
                } catch (e) {
                    this.debug('Ошибка декодирования текста из URL');
                }
            }
            
            // Если нет ни на сервере, ни в URL, загружаем из localStorage
            const saved = localStorage.getItem(`${this.storageKey}-${this.roomId}`);
            if (saved) {
                const data = JSON.parse(saved);
                if (data && data.text !== undefined) {
                    this.isUpdating = true;
                    this.editor.value = data.text || '';
                    this.lastSyncedText = data.text || '';
                    this.lastSyncTime = data.timestamp || 0;
                    this.updateCounters();
                    this.debug('Загружены данные из localStorage:', (data.text || '').length, 'символов');
                    setTimeout(() => { this.isUpdating = false; }, 100);
                }
            }
            
            this.updateSyncStatus('synced', '✅ Готово к синхронизации');
        } catch (error) {
            this.debug('Ошибка загрузки:', error);
            this.updateSyncStatus('synced', '📱 Локальный режим');
        }
    }
    
    // Сохранить данные в localStorage и на сервер
    async saveToStorage() {
        if (!this.roomId || this.isUpdating) return;
        
        const text = this.editor.value;
        const timestamp = Date.now();
        
        // Не сохранять если текст не изменился
        if (text === this.lastSyncedText) return;
        
        try {
            this.updateSyncStatus('syncing', '💾 Сохранение...');
            
            const data = { text, timestamp };
            
            // Сохранить в localStorage
            localStorage.setItem(`${this.storageKey}-${this.roomId}`, JSON.stringify(data));
            
            // Отправить другим вкладкам через BroadcastChannel
            this.channel.postMessage({ 
                roomId: this.roomId, 
                text: text,
                timestamp: timestamp 
            });
            
            // Сохранить на сервер для синхронизации между устройствами
            await this.saveToServer(data);
            
            // Обновить URL для резервной синхронизации
            this.updateURLWithText();
            
            this.lastSyncedText = text;
            this.lastSyncTime = timestamp;
            this.debug('Данные сохранены локально и на сервер');
            this.updateSyncStatus('synced', '🔄 Синхронизировано');
            
        } catch (error) {
            this.debug('Ошибка сохранения:', error);
            this.updateSyncStatus('synced', '🔄 Синхронизировано локально');
        }
    }
    
    // Сохранить на внешний сервер
    async saveToServer(data) {
        try {
            const response = await fetch(`${this.serverUrl}/${this.roomId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                this.debug('Данные сохранены на сервер kvdb.io');
            }
        } catch (error) {
            this.debug('Ошибка сохранения на сервер (работаем локально):', error);
        }
    }
    
    // Загрузить данные с сервера
    async loadFromServer() {
        if (!this.roomId) return;
        
        try {
            const response = await fetch(`${this.serverUrl}/${this.roomId}`);
            
            if (response.ok) {
                const text = await response.text();
                if (text && text !== 'Not found.' && text !== '') {
                    const data = JSON.parse(text);
                    if (data && data.timestamp > this.lastSyncTime && data.text !== this.editor.value) {
                        this.isUpdating = true;
                        this.editor.value = data.text;
                        this.lastSyncedText = data.text;
                        this.lastSyncTime = data.timestamp;
                        this.updateCounters();
                        
                        // Сохранить в localStorage для других вкладок
                        localStorage.setItem(`${this.storageKey}-${this.roomId}`, JSON.stringify(data));
                        
                        this.debug('Получено обновление с сервера kvdb.io:', data.text.length, 'символов');
                        this.updateSyncStatus('synced', '🌐 Обновлено с другого устройства');
                        setTimeout(() => { this.isUpdating = false; }, 100);
                        return true;
                    }
                }
            }
        } catch (error) {
            this.debug('Ошибка загрузки с сервера:', error);
        }
        return false;
    }
    
    
    // Запустить синхронизацию
    startSync() {
        // Проверять обновления с сервера каждую секунду для быстрой синхронизации
        this.syncTimer = setInterval(() => {
            this.loadFromServer();
        }, 1000);
        
        this.debug('Быстрая синхронизация запущена: localStorage + kvdb.io + BroadcastChannel (1 сек)');
    }
    
    // Генерация уникального ID комнаты
    generateRoomId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
}

// Инициализировать редактор при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new TextEditor();
});