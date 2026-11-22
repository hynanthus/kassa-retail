# Розница для Казахстана

Офлайн-касса для небольшого магазина: товары, склад, продажи, клиенты, сертификаты и отчёты.
Работает в браузере и собирается в Android-приложение (APK) через Capacitor.

## Стек

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- sql.js (SQLite в WebAssembly) — база целиком живёт на устройстве
- Capacitor 8 (`@capacitor/filesystem`, `@capacitor/app`, `@capacitor/share`)

## Разработка

```bash
npm install
npm run dev      # http://localhost:5173
npm run lint
npm run build
```

Демо-вход: любой непустой логин и пароль (например, `admin` / `admin123`).

## Где хранится база

| Платформа | Рабочая база | Резервные копии |
| --- | --- | --- |
| Браузер | IndexedDB (`kassa` → `files` → `database.sqlite`) | кнопка «Выгрузить базу» скачивает `.sqlite` |
| Android/iOS | приватная папка приложения: `Data/kassa/kassa_database.sqlite` | автоматически в `Documents/Kassa/kassa_current.sqlite` (если система не разрешает — в `Android/data/kz.kassa.retail/files/Kassa/`), плюс до 5 приватных копий в `Data/kassa/backups` |

Запись в базу отложенная (≈300 мс), поэтому импорт тысяч товаров выполняется одной
транзакцией и одной записью файла. При сворачивании приложения база дописывается
на диск, а копия обновляется в общедоступной папке.

Старые данные из `localStorage` (`kassa_database_v1`) автоматически переносятся
в IndexedDB при первом запуске новой версии.

## Сборка APK

Проще всего — в облаке через GitHub Actions: локально не нужны ни JDK, ни Android SDK.
Корнем репозитория должна быть папка `kassa` (та, где лежит `package.json`).

1. В репозитории уже лежит `.github/workflows/android.yml`.
2. Откройте вкладку **Actions → Android APK → Run workflow** (или просто запушьте в `main`).
3. Через 5–8 минут в задаче `build` будет артефакт **kassa-android-debug** —
   в нём файл `app-debug.apk`. Скачиваете, копируете на телефон, разрешаете
   установку из неизвестных источников.
4. Если запушить тег `v1.0`, вторая задача выложит APK в **GitHub Releases**.

Облачная сборка использует JDK 21: Gradle 8.14.3 из шаблона Capacitor 8 не работает
на JDK 25, а Android Gradle Plugin 8.13 не работает с Gradle 9.

### Локальная сборка (по желанию)

Нужны Android Studio (в ней есть JDK 21 и SDK) либо JDK 21 + Android SDK 36 отдельно.

```bash
npm install
npm run cap:sync          # собирает dist и копирует его в android/
npm run cap:open          # открывает проект в Android Studio: Build → Build APK(s)
```

Либо из командной строки (когда `ANDROID_HOME` указывает на SDK):

```bash
cd android
./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```

Для публикации в Google Play нужна подписанная release-сборка
(`./gradlew assembleRelease` + keystore).

### Параметры приложения

- `appId`: `kz.kassa.retail`
- Название на устройстве: «Розница для Казахстана»
- `versionCode` / `versionName`: `android/app/build.gradle`
- Разрешения: камера (сканер штрихкодов), запись в общие папки только на Android ≤ 10
- `minSdkVersion 24`, `targetSdkVersion 36`

После изменения веб-кода перед сборкой APK всегда выполняйте `npm run cap:sync`.

## Структура

```
src/
  db/            инициализация SQLite, хранилище (IndexedDB/файл), бэкапы
  features/      репозитории (товары, продажи, склад, клиенты, сертификаты)
  screens/       экраны приложения
  shared/        компоненты, хуки, контексты
  services/      уведомления
android/         нативный проект Capacitor
src-tauri/       каркас десктопной сборки Tauri (не используется для APK)
```
