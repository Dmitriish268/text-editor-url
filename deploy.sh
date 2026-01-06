#!/bin/bash

# Скрипт для автоматической публикации на GitHub
# Использование: ./deploy.sh [repository-name]

REPO_NAME=${1:-"text-editor-url"}
USERNAME="Dmitriish268"

echo "🚀 Публикация репозитория на GitHub..."
echo "📦 Имя репозитория: $REPO_NAME"
echo "👤 Username: $USERNAME"
echo ""

# Проверка наличия git
if ! command -v git &> /dev/null; then
    echo "❌ Git не установлен!"
    exit 1
fi

# Проверка наличия GitHub CLI
if command -v gh &> /dev/null; then
    echo "✅ GitHub CLI найден, используем его..."
    
    # Проверка авторизации
    if gh auth status &> /dev/null; then
        echo "✅ Авторизован в GitHub CLI"
        
        # Создать репозиторий и отправить код
        gh repo create "$REPO_NAME" --public --source=. --remote=origin --push
        
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ Репозиторий создан и код отправлен!"
            echo ""
            echo "🌐 Настройте GitHub Pages:"
            echo "   1. Откройте: https://github.com/$USERNAME/$REPO_NAME/settings/pages"
            echo "   2. Source: Branch 'main', Folder '/ (root)'"
            echo "   3. Сохраните"
            echo ""
            echo "📝 Ваше приложение будет доступно по адресу:"
            echo "   https://$USERNAME.github.io/$REPO_NAME/"
        else
            echo "❌ Ошибка при создании репозитория"
            exit 1
        fi
    else
        echo "⚠️  Не авторизован в GitHub CLI"
        echo "   Выполните: gh auth login"
        exit 1
    fi
else
    echo "⚠️  GitHub CLI не установлен"
    echo ""
    echo "📋 Выполните следующие команды вручную:"
    echo ""
    echo "1. Создайте репозиторий на GitHub:"
    echo "   https://github.com/new"
    echo "   Имя: $REPO_NAME"
    echo "   Public, без README"
    echo ""
    echo "2. Затем выполните:"
    echo "   git remote add origin https://github.com/$USERNAME/$REPO_NAME.git"
    echo "   git branch -M main"
    echo "   git push -u origin main"
    echo ""
    echo "3. Настройте GitHub Pages:"
    echo "   https://github.com/$USERNAME/$REPO_NAME/settings/pages"
    echo "   Source: Branch 'main', Folder '/ (root)'"
fi

