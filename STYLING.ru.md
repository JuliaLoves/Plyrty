<div align="center">

# Документация **Plyrty** - Глобальная стилизация

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)
[![Русский](https://img.shields.io/badge/язык-Русский-red)](README.ru.md)

</div>

## Обзор

**Plyrty** предоставляет гибкие возможности для глобальной настройки внешнего вида плеера через CSS-переменные. Это позволяет легко адаптировать плеер под дизайн любого сайта.

## Глобальная настройка стиля

Для изменения стиля плеера на всем сайте, переопределите CSS-переменные в вашем основном файле стилей:

```css
/* Пример глобальной настройки для всего сайта */
.plyrty-root {
  --plyrty-primary: #ff6b35;
  --plyrty-background: #1a1a1a;
  --plyrty-text: #ffffff;
  --plyrty-accent: #ff6b35;
  --plyrty-controls-bg: rgba(30, 30, 30, 0.85);
}
```

## Доступные CSS-переменные

### Основные цвета
- `--plyrty-primary`: Основной цвет (по умолчанию: #19cc31)
- `--plyrty-secondary`: Вторичный цвет (по умолчанию: #000)
- `--plyrty-background`: Цвет фона (по умолчанию: #000)
- `--plyrty-controls-bg`: Фон элементов управления (по умолчанию: rgba(20, 20, 20, 0.75))
- `--plyrty-text`: Цвет текста (по умолчанию: #fff)
- `--plyrty-muted`: Цвет второстепенного текста (по умолчанию: #cfcfcf)
- `--plyrty-accent`: Акцентный цвет (по умолчанию: #19cc31)

### Цвета для элементов управления
- `--plyrty-button-bg`: Фон кнопок (по умолчанию: transparent)
- `--plyrty-button-color`: Цвет кнопок (по умолчанию: var(--plyrty-text))
- `--plyrty-button-hover-bg`: Фон кнопок при наведении (по умолчанию: rgba(255, 255, 255, 0.12))
- `--plyrty-progress-bg`: Фон прогресс-бара (по умолчанию: rgba(255, 255, 255, 0.25))
- `--plyrty-progress-filled`: Заполнение прогресс-бара (по умолчанию: var(--plyrty-accent))
- `--plyrty-tooltip-bg`: Фон всплывающих подсказок (по умолчанию: rgba(0, 0, 0, 0.7))
- `--plyrty-tooltip-border`: Граница всплывающих подсказок (по умолчанию: rgba(255, 255, 255, 0.15))

### Размеры и отступы
- `--plyrty-font-family`: Шрифт (по умолчанию: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif)
- `--plyrty-button-size`: Размер кнопок (по умолчанию: 40px)
- `--plyrty-button-radius`: Радиус скругления кнопок (по умолчанию: 10px)
- `--plyrty-big-button-size`: Размер большой кнопки (по умолчанию: 72px)
- `--plyrty-control-padding`: Отступы элементов управления (по умолчанию: 10px)
- `--plyrty-gap-size`: Отступы между элементами (по умолчанию: 10px)
- `--plyrty-border-radius`: Радиус скругления (по умолчанию: 12px)

### Анимации
- `--plyrty-transition-speed`: Скорость переходов (по умолчанию: 180ms)
- `--plyrty-easing`: Функция плавности (по умолчанию: ease)

## Примеры

### Пример 1: Простое применение глобального стиля

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="plyrty.css">
  <style>
    /* Глобальное переопределение стиля */
    .plyrty-root {
      --plyrty-primary: #e91e63;
      --plyrty-background: #121212;
      --plyrty-text: #ffffff;
      --plyrty-accent: #e91e63;
    }
  </style>
</head>
<body>
  <div class="plyrty-root">
    <video controls>
      <source src="video.mp4" type="video/mp4">
    </video>
  </div>
  
  <script src="plyrty.js"></script>
</body>
</html>
```

### Пример 2: Применение стиля для конкретного плеера

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="plyrty.css">
</head>
<body>
  <div id="custom-player" class="plyrty-root">
    <video controls>
      <source src="video.mp4" type="video/mp4">
    </video>
  </div>
  
  <script>
    // Применение стиля программно
    const player = document.getElementById('custom-player');
    player.style.setProperty('--plyrty-primary', '#9c27b0');
    player.style.setProperty('--plyrty-background', '#212121');
    player.style.setProperty('--plyrty-text', '#ffffff');
    player.style.setProperty('--plyrty-accent', '#9c27b0');
  </script>
  <script src="plyrty.js"></script>
</body>
</html>
```

### Пример 3: Интеграция с CSS-фреймворками

```css
/* Пример интеграции с Tailwind CSS */
.player-dark {
  --plyrty-primary: theme('colors.green.500');
  --plyrty-background: theme('colors.gray.900');
  --plyrty-text: theme('colors.white');
  --plyrty-accent: theme('colors.green.500');
}

.player-light {
  --plyrty-primary: theme('colors.blue.600');
  --plyrty-background: theme('colors.white');
  --plyrty-text: theme('colors.gray.900');
  --plyrty-accent: theme('colors.blue.600');
}
```

```html
<div class="plyrty-root player-dark">
  <video controls>
    <source src="video.mp4" type="video/mp4">
  </video>
</div>
```

## Совместимость

Все глобальные настройки стиля полностью совместимы с существующими функциями **Plyrty**, включая:

- Автоматическое определение типа потока (**HLS**/**DASH**)
- Умное переключение качества
- Поддержку Chromecast
- Режим "картинка в картинке"
- Полноэкранный режим
- Управление громкостью и скоростью воспроизведения
- Улучшенное мобильное взаимодействие