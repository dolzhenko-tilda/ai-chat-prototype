# Видео в ответе

Перебор ссылок на видео из таблицы «Видео» (лист «Ссылки») и крайних случаев разметки. Перед каждой ссылкой написано, что ожидается в виджете.

## YouTube

Обычная ссылка `watch?v=` — обложка, по клику плеер YouTube с автозапуском.

[Video](https://www.youtube.com/watch?v=VjXNIxRUNp0 "video:YouTube, watch")

Ссылка с таймкодом `&start=60` — плеер без параметра, видео начинается сначала.

[Video](https://www.youtube.com/watch?v=HiZdZYyTauM&start=60 "video:YouTube, watch с &start=60")

Shorts — вертикальное видео в рамке 16:9.

[Video](https://www.youtube.com/shorts/4drVyniTiF0 "video:YouTube, shorts")

[Video](https://youtu.be/VjXNIxRUNp0 "video:YouTube, youtu.be")

[Video](https://m.youtube.com/watch?v=K4TOrB7at0Y "video:YouTube, мобильная ссылка")

Embed-ссылка с параметрами — параметры отбрасываются.

[Video](https://www.youtube.com/embed/XEfDYMngJeE?rel=0&fmt=18&html5=1&showinfo=0 "video:YouTube, embed с параметрами")

[Video](https://www.youtube.com/live/WuGeHnUTicQ "video:YouTube, live")

## Vimeo

[Video](https://vimeo.com/11961930 "video:Vimeo, обычная ссылка")

Автор видео убрал кнопку полноэкранного режима из встроенного плеера — включить её снаружи нельзя.

[Video](https://vimeo.com/826026805 "video:Vimeo, автор отключил полноэкранный режим")

[Video](https://vimeo.com/channels/staffpicks/728924613 "video:Vimeo, видео из канала")

Таймкод `#t=` отбрасывается.

[Video](https://vimeo.com/11961930#t=15s "video:Vimeo, с таймкодом")

[Video](https://vimeo.com/11961930?share=copy "video:Vimeo, ?share=copy")

[Video](https://player.vimeo.com/video/11961930 "video:Vimeo, ссылка на плеер")

Приватное видео — хеш из пути уходит в плеер параметром `h`.

[Video](https://vimeo.com/76979871/8272103f6e "video:Vimeo, приватное")

[Video](https://player.vimeo.com/video/76979871?h=8272103f6e "video:Vimeo, приватное, ссылка на плеер")

Хеш с точкой не проходит проверку и отбрасывается — плеер Vimeo, скорее всего, покажет ошибку доступа.

[Video](https://vimeo.com/76979871/bad.hash "video:Vimeo, приватное с мусорным хешем")

## VK Video

[Video](https://vkvideo.ru/video-75078567_456262275 "video:VK, vkvideo.ru")

[Video](https://vk.com/video-217873238_456243931 "video:VK, vk.com")

[Video](https://vksport.vkvideo.ru/video-605353_162296606 "video:VK, vksport")

[Video](https://vkvideo.ru/clip-211054596_456243023 "video:VK, клип на vkvideo.ru")

[Video](https://vk.com/clip-211054596_456243023 "video:VK, клип на vk.com")

[Video](https://m.vkvideo.ru/video-29615500_170579792 "video:VK, мобильная vkvideo.ru")

[Video](https://m.vk.ru/video-217873238_456243931 "video:VK, мобильная vk.ru")

Ссылка на плеер с хешем — хеш уходит в плеер.

[Video](https://vkvideo.ru/video_ext.php?oid=-227034863&id=456239527&hash=99fae216cf20dcdc "video:VK, video_ext.php с хешем")

Приватное видео по ссылке со страницы: `list` в плеер не передаётся, поэтому плеер, скорее всего, не откроет видео.

[Video](https://vkvideo.ru/video23572803_456239044?list=ln-2JxYk3wv9LHwKpnGPU&t=1m3s "video:VK, приватное со списком и таймкодом")

## Rutube

[Video](https://rutube.ru/video/a2335a1471efa50390dc2a4f5a51d14f/ "video:Rutube, обычная ссылка")

[Video](https://rutube.ru/shorts/d7b6fb23381d7bfead76758f86edc2ec/?r=a "video:Rutube, shorts")

[Video](https://rutube.ru/play/embed/33ea7dd8a19bc6e548f42a85ba0b81e3 "video:Rutube, ссылка на плеер")

Приватное видео — ключ `p` уходит в плеер.

[Video](https://rutube.ru/video/private/371dae00e543dcc8ef5199d36e8270a6/?p=29YMblWwawvm6qMYk029wQ "video:Rutube, приватное")

[Video](https://rutube.ru/live/video/546602986e6a424d74d594876ddb3f04/ "video:Rutube, эфир")

Yappy и Rutube Sport не встраиваются — карточка, по клику новая вкладка. Обложки у них сервис не находит, остаётся его заглушка. Плеер Rutube не принимает id из ссылки yappy, а в ссылке Rutube Sport вместо id название видео.

[Video](https://rutube.ru/yappy/c34cf742a8eb4111a1a02b062bd50dfc "video:Rutube, yappy")

[Video](https://rutube.sport/video/uniks-mba-mai-edinaia-liga-vtb "video:Rutube Sport")

## Kinescope

[Video](https://kinescope.io/2czhhhBNp1bu3gQZEkEbFq "video:Kinescope, обычная ссылка")

[Video](https://kinescope.io/tEWgx4HiJ6TzpYiPhEW8wx/plWzQwas "video:Kinescope, приватное")

[Video](https://kinescope.io/embed/2czhhhBNp1bu3gQZEkEbFq "video:Kinescope, ссылка на плеер")

Плейлист не встраивается — карточка с обложкой первого видео, по клику новая вкладка.

[Video](https://kinescope.io/pl/e5Crz7gCEJ6K1Jf8asgHQL "video:Kinescope, плейлист")

## Boomstream

Открытое видео — по клику запускается само, без звука: при автозапуске Boomstream всегда выключает звук.

[Video](https://play.boomstream.com/VCcNtuiw "video:Boomstream, play.boomstream.com")

[Video](https://play.boomstream.net/VCcNtuiw "video:Boomstream, play.boomstream.net")

Платное видео — до покупки плеер показывает только обложку, автозапуск срабатывает после оплаты.

[Video](https://play.boomstream.com/kK5LQTZP "video:Boomstream, платное")

Удалённое видео — плеер Boomstream пишет «Video is not found».

[Video](https://play.boomstream.net/lDHFw5hK "video:Boomstream, удалённое")

Файл с CDN Boomstream играет в плеере браузера.

[Video](https://cdn-g.boomstream.com/balancer/l7A8U8H6-7dR8wQoH.mp4 "video:Boomstream, mp4-файл")

## Видеофайлы

Плеер браузера: обложка из сервиса становится постером, по клику видео запускается само.

[Video](https://video.tilda.cc/tilda.cc/tpl_1035-main.mp4 "video:mp4, вертикальное")

[Video](https://video.tilda.cc/ru/tutorials/zero-block-main.mp4 "video:mp4, урок из базы знаний")

Параметры после расширения.

[Video](https://video.tilda.cc/tilda.cc/tpl_1035-main.mp4?v=2 "video:mp4 с ?v=2")

[Video](https://upload.wikimedia.org/wikipedia/commons/2/22/Volcano_Lava_Sample.webm "video:webm")

Файлы, которых нет на сервере: обложка — заглушка сервиса, по клику — «Не удалось загрузить видео». Кириллический домен заодно проверяет, что в `src` уходит punycode, а в сервис обложек — исходная ссылка в UTF-8.

[Video](https://малинаполина.рф/видюшка-mp4.mp4 "video:mp4, кириллический домен — 403")

[Video](https://video.tilda.cc/tilda.cc/tpl_1035-main.MP4 "video:mp4, .MP4 — 404, сервер различает регистр")

[Video](https://video.tilda.cc/missing/does-not-exist.mp4 "video:mp4, файла не существует")

Файл по http — карточка с обложкой, по клику новая вкладка: на https-странице браузер может такой файл не загрузить.

[Video](http://tilda.ws/video_test/drawing_4_1_3.mp4 "video:mp4 по http")

## Незнакомые и подозрительные ссылки

Хостинг без плеера — карточка с заглушкой сервиса обложек, по клику новая вкладка. Ссылку на Дзен прячут блокировщики рекламы — тогда остаётся чёрная рамка без иконки.

[Video](https://dzen.ru/video/watch/6512c1f0a3b4c5d6e7f8a9b0 "video:Дзен")

[Video](https://www.youtube-nocookie.com/embed/VjXNIxRUNp0 "video:youtube-nocookie")

Хост, похожий на YouTube, — карточка, а не iframe с чужим адресом.

[Video](https://youtube.com.evil.example/watch?v=VjXNIxRUNp0 "video:Хост под YouTube")

Идентификатор, который увёл бы адрес плеера за его путь, — карточка.

[Video](https://www.youtube.com/watch?v=../../evil "video:Мусорный id YouTube")

[Video](https://rutube.ru/video/a.b/ "video:Мусорный id Rutube")

Страница хостинга, а не видео, — карточка.

[Video](https://vkvideo.ru/ "video:Главная VK Video")

Хостинг по http — как по https: обложка, по клику плеер по https.

[Video](http://www.youtube.com/watch?v=VjXNIxRUNp0 "video:YouTube по http")

[Video](http://vimeo.com/11961930 "video:Vimeo по http")

Относительная ссылка — карточка с заглушкой обложки, по клику путь открывается в новой вкладке на домене страницы.

[Video](/video/zero-block.mp4 "video:Относительная ссылка")

## Крайние случаи разметки

Пустое описание.

[Video](https://vimeo.com/11961930 "video:")

Текст ссылки не «Video» — он не выводится, подпись берётся из описания.

[Посмотрите урок](https://rutube.ru/video/a2335a1471efa50390dc2a4f5a51d14f/ "video:Текст ссылки отличается от Video")

Длинное описание с кавычками, скобками и markdown-символами, которые выводятся как текст.

[Video](https://kinescope.io/2czhhhBNp1bu3gQZEkEbFq "video:Очень длинное описание видео, чтобы проверить переносы строк в подписи под плеером: «ёлочки», \"прямые кавычки\", (скобки), **звёздочки**, `бэктики` и [квадратные скобки] — всё это выводится как обычный текст и не ломает разметку карточки.")

Адрес в угловых скобках.

[Video](<https://vimeo.com/11961930> "video:Адрес в угловых скобках")

Ссылка-сноска.

[Video][video-reference]

[video-reference]: https://youtu.be/VjXNIxRUNp0 "video:Ссылка-сноска"

Одно и то же видео два раза подряд — каждый плеер запускается отдельно.

[Video](https://youtu.be/VjXNIxRUNp0 "video:Первый экземпляр")
[Video](https://youtu.be/VjXNIxRUNp0 "video:Второй экземпляр")

Видео посреди абзаца: текст до [Video](https://vimeo.com/11961930 "video:Видео внутри абзаца") и текст после.

Видео в списке:

- Первый пункт.
- [Video](https://rutube.ru/play/embed/33ea7dd8a19bc6e548f42a85ba0b81e3 "video:Видео в пункте списка")
- Третий пункт.

Видео в цитате:

> [Video](https://kinescope.io/2czhhhBNp1bu3gQZEkEbFq "video:Видео в цитате")

Видео в выноске:

> [!TIP]
> [Video](https://video.tilda.cc/tilda.cc/tpl_1035-main.mp4 "video:Видео в выноске")

Видео в ячейке таблицы:

| Урок | Видео |
| --- | --- |
| Zero Block | [Video](https://youtu.be/VjXNIxRUNp0 "video:Видео в таблице") |

Ссылка на видео без маркера `video:` — обычная ссылка.

[Урок на YouTube](https://youtu.be/VjXNIxRUNp0)

Ссылка на видео с маркером `source:` — ссылка на источник.

[Урок на YouTube](https://youtu.be/VjXNIxRUNp0 "source:Урок на YouTube")

Голый адрес видео — автоссылка, а не карточка: https://youtu.be/VjXNIxRUNp0

Синтаксис картинки с адресом видео — картинка не загрузится: заглушка во всю ширину, галерея по клику не открывается.

![Видео как картинка](https://youtu.be/VjXNIxRUNp0)

Последним в ответе — видео, без текста после него: в стриме ссылка придерживается, пока не закроется скобка.

[Video](https://vkvideo.ru/video-75078567_456262275 "video:Видео в самом конце ответа")
