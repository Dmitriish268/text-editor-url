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
        
        // API для синхронизации (используем публичную Firebase)
        this.apiUrl = 'https://text-editor-demo-default-rtdb.firebaseio.com';
        
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
        
        // Загрузить данные с сервера
        this.loadFromServer();
        
        // Запустить синхронизацию
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
    
    // Обработчик изменения текста
    onTextChange() {
        if (this.isUpdating) return; // Не обрабатываем изменения во время синхронизации
        
        // Обновить счетчики
        this.updateCounters();
        
        // Сохранить на сервер с задержкой
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.saveToServer();
        }, 1000);
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
        // Сначала сохранить текущий текст на сервер
        await this.saveToServer();
        
        const url = window.location.href;
        
        try {
            await navigator.clipboard.writeText(url);
            this.showStatus('✅ Ссылка скопирована! Открывайте на любых устройствах');
        } catch (e) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showStatus('✅ Ссылка скопирована! Открывайте на любых устройствах');
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
            this.saveToServer();
        }
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        this.syncText.textContent = text;
        this.debug('Статус:', status, text);
    }
    
    // Загрузить данные с сервера
    async loadFromServer() {
        if (!this.roomId) return;
        
        try {
            this.updateSyncStatus('syncing', 'Загрузка...');
            
            const response = await fetch(`${this.apiUrl}/rooms/${this.roomId}.json`);
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.text !== undefined) {
                    this.isUpdating = true;
                    this.editor.value = data.text || '';
                    this.lastSyncedText = data.text || '';
                    this.lastSyncTime = data.timestamp || 0;
                    this.updateCounters();
                    this.debug('Загружены данные с сервера:', (data.text || '').length, 'символов');
                    setTimeout(() => { this.isUpdating = false; }, 100);
                }
            }
            
            this.updateSyncStatus('synced', 'Готово к синхронизации');
        } catch (error) {
            this.debug('Ошибка загрузки с сервера:', error);
            this.updateSyncStatus('synced', 'Локальный режим');
        }
    }
    
    // Сохранить данные на сервер
    async saveToServer() {
        if (!this.roomId || this.isUpdating) return;
        
        const text = this.editor.value;
        const timestamp = Date.now();
        
        // Не сохранять если текст не изменился
        if (text === this.lastSyncedText) return;
        
        try {
            this.updateSyncStatus('syncing', 'Сохранение...');
            
            const data = { text, timestamp };
            
            const response = await fetch(`${this.apiUrl}/rooms/${this.roomId}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                this.lastSyncedText = text;
                this.lastSyncTime = timestamp;
                this.debug('Данные сохранены на сервер');
                this.updateSyncStatus('synced', 'Сохранено');
            } else {
                throw new Error('Ошибка сохранения');
            }
        } catch (error) {
            this.debug('Ошибка сохранения:', error);
            this.updateSyncStatus('error', 'Ошибка сохранения');
        }
    }
    
    // Проверить обновления с сервера
    async checkServerUpdates() {
        if (!this.roomId || this.isUpdating) return;
        
        try {
            const response = await fetch(`${this.apiUrl}/rooms/${this.roomId}.json`);
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.timestamp > this.lastSyncTime && data.text !== this.editor.value) {
                    this.isUpdating = true;
                    this.editor.value = data.text;
                    this.lastSyncedText = data.text;
                    this.lastSyncTime = data.timestamp;
                    this.updateCounters();
                    this.debug('Получено обновление с сервера:', data.text.length, 'символов');
                    this.updateSyncStatus('synced', 'Обновлено');
                    setTimeout(() => { this.isUpdating = false; }, 100);
                }
            }
        } catch (error) {
            // Не показываем ошибки при проверке обновлений
        }
    }
    
    // Запустить синхронизацию
    startSync() {
        // Проверять обновления каждые 2 секунды
        this.syncTimer = setInterval(() => {
            this.checkServerUpdates();
        }, 2000);
        
        this.debug('Синхронизация запущена');
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
