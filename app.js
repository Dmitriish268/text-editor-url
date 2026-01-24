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
        this.roomId = null;
        this.lastSyncedText = '';
        this.debugMode = true;
        
        this.init();
    }
    
    debug(...args) {
        if (this.debugMode) {
            console.log(`[DEBUG]`, ...args);
        }
    }
    
    init() {
        this.debug('Инициализация редактора');
        
        // Загрузить данные из URL
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
        
        // Обновить счетчики
        this.updateCounters();
        
        // Обновить статус
        this.updateSyncStatus('synced', 'Готов к работе');
    }
    
    // Загрузить данные из URL
    loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        const textParam = params.get('text');
        
        // Загрузить текст из URL если есть
        if (textParam) {
            try {
                const decodedText = decodeURIComponent(atob(textParam));
                if (decodedText) {
                    this.editor.value = decodedText;
                    this.lastSyncedText = decodedText;
                    this.debug('Загружен текст из URL:', decodedText.length, 'символов');
                }
            } catch (e) {
                this.debug('Ошибка декодирования текста из URL');
            }
        }
        
        // Установить или создать roomId
        if (roomId) {
            this.roomId = roomId;
            this.debug('Использован roomId из URL:', roomId);
        } else {
            this.roomId = this.generateRoomId();
            this.debug('Создан новый roomId:', this.roomId);
        }
    }
    
    // Обновить URL с текстом
    updateURL() {
        if (!this.roomId) return;
        
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('room', this.roomId);
        
        const text = this.editor.value;
        if (text && text.length < 2000) { // Ограичение длины URL
            try {
                const encodedText = btoa(encodeURIComponent(text));
                url.searchParams.set('text', encodedText);
            } catch (e) {
                this.debug('Ошибка кодирования текста');
            }
        }
        
        window.history.replaceState({}, '', url);
        this.debug('URL обновлен');
    }
    
    // Обработчик изменения текста
    onTextChange() {
        // Обновить счетчики
        this.updateCounters();
        
        // Обновить URL с небольшой задержкой
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this.updateURL();
            this.updateSyncStatus('synced', 'Сохранено в ссылке');
        }, 500);
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
        // Сначала обновить URL с текущим текстом
        this.updateURL();
        
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
            this.updateURL();
        }
    }
    
    // Обновить статус синхронизации
    updateSyncStatus(status, text) {
        this.syncIndicator.className = `sync-indicator ${status}`;
        this.syncText.textContent = text;
        this.debug('Статус:', status, text);
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
