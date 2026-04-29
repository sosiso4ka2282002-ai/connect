# CONNECT — защищённый веб‑заметочник (локальная версия)

Этот проект — заметочник с лендингом, регистрацией, входом и приложением заметок с шифрованием на стороне клиента.
Все данные хранятся локально в IndexedDB (Dexie) — внешние сервисы (Supabase и т.п.) не нужны.

Ниже — простая инструкция «для чайников», как его запустить.

---

## 1. Что нужно установить

- Node.js (желательно LTS 18+ или 20+)
- npm (обычно ставится вместе с Node.js)

Проверить:

```bash
node -v
npm -v
```

---

## 2. Как скачать проект

Если проект уже лежит у тебя на диске (как в моём случае), этот шаг можно пропустить.
Иначе:

```bash
git clone <ссылка-на-репозиторий>
cd obsidian-online
```

---

## 3. Локальная база данных

Приложение работает полностью локально — все данные (пользователи, заметки, профили) хранятся в IndexedDB браузера через библиотеку **Dexie**.

Никаких внешних сервисов или `.env`-файлов настраивать **не нужно**. Достаточно установить зависимости и запустить.

---

## 4. Установка зависимостей

Выполнить один раз:

```bash
cd "/Users/stepanka/Documents/obsidian online /obsidian-online"
export NPM_CONFIG_CACHE=/tmp/.npm-cache
npm install --no-audit --no-fund
```

---

## 5. Запуск в режиме разработки

Команда:

```bash
cd "/Users/stepanka/Documents/obsidian online /obsidian-online"
npm run dev
```

Открой в браузере:

```text
http://localhost:5173/
```

Что должно быть:
- Открывается лендинг CONNECT.
- Кнопки «Войти» / «Зарегистрироваться» открывают модальное окно.
- После регистрации и входа ты попадаешь в `/app` (приложение заметок).

---

## 6. Сборка продакшн‑версии

Сборка:

```bash
cd "/Users/stepanka/Documents/obsidian online /obsidian-online"
npm run build
```

Готовый билд будет в папке `dist/`:
- `dist/index.html`
- `dist/assets/index-*.js`, `index-*.css`

---

## 7. Проверка продакшн‑сборки локально

```bash
cd "/Users/stepanka/Documents/obsidian online /obsidian-online"
npm run preview
```

Открой:

```text
http://localhost:4173/
```

Это имитация того, как сайт будет работать на сервере.

---

## 8. Деплой на сервер (VDS с nginx, пример)

1. Собери проект:

```bash
npm run build
```

2. Скопируй содержимое `dist/` на сервер в папку, например, `/var/www/connect`.

3. Настрой nginx (упрощённый пример):

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/connect;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

4. Перезагрузи nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

После этого:
- `https://example.com/` — лендинг.
- `https://example.com/app` — приложение заметок (после входа).

---

## 9. Частые вопросы

- **Нужен ли Node.js на сервере?**  
  Для статики (как здесь) — нет, достаточно nginx/Apache. Node.js нужен только для сборки, её можно делать локально.

- **Почему я вижу 404 при прямом заходе на `/app`?**  
  Потому что сервер отдаёт файлы. Нужно настроить `try_files ... /index.html;` как в примере nginx.

- **Можно ли заливать на «лендинг‑хостинги» (Keitaro и т.п.)?**  
  Да, если они умеют отдавать `index.html` и `assets` как статические файлы. Главное — загружать результат сборки (`dist/`), а не исходники.

---

Если запускаешь на другой машине — просто адаптируй пути (`cd ...`) и домен в nginx под свою среду.

