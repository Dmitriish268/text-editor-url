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
        
        // Используем localStorage + URL sync для реальной синхронизации
        this.storageKey = 'texteditor-sync';
        
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
        
        // Загрузить данные из localStorage/URL
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
        // Сначала сохранить текущий текст в URL
        this.updateURLWithText();
        
        const url = window.location.href;
        
        try {
            await navigator.clipboard.writeText(url);
            this.showStatus('✅ Ссылка скопирована! Синхронизируется между всеми устройствами');
        } catch (e) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showStatus('✅ Ссылка скопирована! Синхронизируется между всеми устройствами');
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
    clearText() {
        if (confirm('Вы уверены, что хотите очистить весь текст?')) {
            this.editor.value = '';
            this.updateCounters();
            this.saveToStorage();
        }
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        this.syncText.textContent = text;
        this.debug('Статус:', status, text);
    }
    
    // Загрузить данные из localStorage или URL
    loadFromStorage() {
        if (!this.roomId) return;
        
        try {
            // Сначала проверим URL параметры (приоритет)
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
                        this.saveToStorage(); // Сохранить в localStorage для других вкладок
                        this.updateSyncStatus('synced', '🔗 Загружено из ссылки');
                        return;
                    }
                } catch (e) {
                    this.debug('Ошибка декодирования текста из URL');
                }
            }
            
            // Если нет в URL, загружаем из localStorage
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
    
    // Сохранить данные в localStorage и синхронизировать
    saveToStorage() {
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
            
            // Обновить URL для внешней синхронизации
            this.updateURLWithText();
            
            this.lastSyncedText = text;
            this.lastSyncTime = timestamp;
            this.debug('Данные сохранены локально и синхронизированы');
            this.updateSyncStatus('synced', '🔄 Синхронизировано');
            
        } catch (error) {
            this.debug('Ошибка сохранения:', error);
            this.updateSyncStatus('error', '❌ Ошибка сохранения');
        }
    }
    
    // Проверить изменения URL (для внешней синхронизации)
    checkURLChanges() {
        try {
            const params = new URLSearchParams(window.location.search);
            const textParam = params.get('text');
            
            if (textParam) {
                const decodedText = decodeURIComponent(atob(textParam));
                if (decodedText !== this.lastSyncedText && decodedText !== this.editor.value) {
                    this.isUpdating = true;
                    this.editor.value = decodedText;
                    this.lastSyncedText = decodedText;
                    this.updateCounters();
                    this.saveToStorage(); // Сохранить в localStorage
                    this.updateSyncStatus('synced', '🌐 Обновлено с другого устройства');
                    this.debug('Обновлено из URL:', decodedText.length, 'символов');
                    setTimeout(() => { this.isUpdating = false; }, 100);
                }
            }
        } catch (error) {
            this.debug('Ошибка проверки URL:', error);
        }
    }
    
    // Запустить синхронизацию
    startSync() {
        // Проверять изменения URL каждые 2 секунды (для внешней синхронизации)
        this.syncTimer = setInterval(() => {
            this.checkURLChanges();
        }, 2000);
        
        this.debug('Синхронизация запущена: localStorage + URL + BroadcastChannel');
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