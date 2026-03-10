# 📅 AliPlanner — Деплой на Railway

## Что это
Веб-приложение на Node.js. После деплоя получаешь URL вида:
`https://aliplanner-production.up.railway.app`

Открывается в **любом браузере** на **любом устройстве** — ПК, телефон, планшет.

---

## Деплой за 5 минут

### 1. Зарегистрируйся на Railway
👉 https://railway.app → войди через GitHub

### 2. Создай проект
- Нажми **New Project** → **Deploy from GitHub repo**
- Если нет GitHub — выбери **Empty Project** → **Add a Service** → **GitHub Repo**

### 3. Загрузи файлы на GitHub
Если нет репозитория — самый простой способ:
1. Зайди на https://github.com/new
2. Создай репозиторий `aliplanner` (Public или Private)
3. Загрузи все файлы из этой папки через кнопку **Add file → Upload files**

### 4. Подключи репо к Railway
- В Railway: **New Project** → **Deploy from GitHub repo**
- Выбери свой репозиторий `aliplanner`
- Railway автоматически запустит сервер

### 5. Задай переменные окружения
В Railway: открой сервис → вкладка **Variables** → добавь:

```
YA_LOGIN     = ali@yandex.ru
YA_PASS      = xxxxxxxxxxxxxxxxxxxx
CLOUD_FOLDER = AliPlanner
NODE_ENV     = production
```

Пароль приложения получить: https://id.yandex.ru/security/app-passwords
Тип: WebDAV, название: AliPlanner

### 6. Получи URL
Вкладка **Settings** → **Domains** → **Generate Domain**
Получишь URL вида: `https://aliplanner-xxx.up.railway.app`

---

## Открытие на любом устройстве

Просто открой свой URL в браузере:
- 💻 Windows / Mac / Linux — Chrome, Firefox, Edge, Safari
- 📱 iPhone / Android — любой браузер
- 📌 Добавь в закладки или на главный экран телефона

---

## Бесплатный тариф Railway
- $5 кредитов в месяц (хватает для личного использования)
- Приложение спит если нет запросов, просыпается за ~1 секунду

## Альтернативы
- **Render.com** — аналогично, тоже бесплатно
- **Fly.io** — немного сложнее
