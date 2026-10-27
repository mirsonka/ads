// Пиксели макета во вьюпортах — как --u и --m в stylesheets/style.css: на телефонах
// (до 700px) от ширины 390, иначе от 1440. Смещения анимаций задаются в пикселях
// макета и масштабируются вместе с вёрсткой; функции-значения GSAP пересчитывают их
// при смене размера окна.
const layoutPx = (value) =>
  (value * window.innerWidth) /
  (matchMedia("(max-width: 700px)").matches ? 390 : 1440);

// Переход hero → мониторы: экран закрепляется, красный слой поднимается снизу
// и закрывает жёлтую секцию. Привязано к скроллу, в обратную сторону работает само.
// Без GSAP секции остаются обычными блоками друг под другом.
// Закрепляем сразу с верха страницы, а слой стартует от нижнего края окна (а не hero,
// который бывает выше окна), — красный появляется с первого же пикселя прокрутки.

(() => {
  const wipe = document.querySelector(".wipe");

  if (!wipe || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const layer = wipe.querySelector(".monitors");

  wipe.classList.add("wipe--active");

  gsap.fromTo(
    layer,
    { y: () => window.innerHeight },
    {
      y: 0,
      ease: "none",
      scrollTrigger: {
        trigger: wipe,
        start: "top top",
        // длина перехода — один экран скролла
        end: "+=100%",
        pin: true,
        // без сглаживания: слой идёт за скроллом без запаздывания
        scrub: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    },
  );
})();

// Экран 3, экран с ноутбуком и «продажа через шоу»: абзацы проявляются по строкам вместе со скроллом
// (opacity 0 → 1, y 30px → 0), при обратном скролле прячутся обратно. Строки
// пересобираются при смене ширины и после загрузки шрифта (autoSplit).
// При prefers-reduced-motion текст просто виден.
(() => {
  const texts = document.querySelectorAll(
    ".noise__text, .laptop__text, .show__text, .dense__text",
  );

  if (
    !texts.length ||
    !window.gsap ||
    !window.ScrollTrigger ||
    !window.SplitText
  )
    return;

  gsap.registerPlugin(ScrollTrigger, SplitText);

  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    texts.forEach((text) => {
      SplitText.create(text, {
        type: "lines",
        linesClass: "text-line",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            opacity: 0,
            y: () => layoutPx(30),
            ease: "power1.out",
            stagger: 0.25,
            scrollTrigger: {
              trigger: text,
              // clamp — чтобы анимация успевала закончиться, даже если ниже
              // абзаца страница уже кончается
              start: "clamp(top 90%)",
              end: "clamp(bottom 60%)",
              // «продажа через шоу» — внизу страницы, тексты низко на экране:
              // заканчиваем, когда экран целиком в окне, вместе с компьютером
              ...(text.closest(".show") && {
                endTrigger: text.closest(".show"),
                end: "clamp(bottom bottom)",
              }),
              scrub: 0.6,
            },
          }),
      });
    });
  });
})();

// Экраны 4 и 5: экран закрепляется, жёлтый клин выезжает из-за правого края и, сохраняя
// наклон из макета, заливает весь экран. Затем «Очень громко» уезжает влево, а на его
// место справа въезжает «Очень много шума». Потом поверх него слева въезжает карточка
// и трясётся, после чего снизу поднимается красный экран «в лифте».
// Всё привязано к скроллу, назад работает само.
// Клин — полуплоскость правее диагонали; двигаем точку, где диагональ пересекает верх.
// Тёмная копия заголовка обрезается той же формой в той же анимации — граница цвета
// на буквах совпадает с краем клина.
(() => {
  const swap = document.querySelector(".swap");

  if (!swap || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const loud = swap.querySelector(".loud");
  const din = swap.querySelector(".din");
  const note = swap.querySelector(".note");
  const layers = loud.querySelectorAll(".loud__wedge, .loud__ink");
  // наклон границы клина в макете: на 959px вправо — 633px вниз
  const slope = 632.93 / 958.92;
  // запас вправо, чтобы правый край многоугольника всегда был за кадром
  const far = 10000;

  // форма выходит за верх и низ секции на bleed px: иначе на Retina при дробной позиции
  // секции край обрезки сглаживается и на стыке со следующим экраном видна красная линия
  const bleed = 4;

  const shape = (top) => {
    const h = loud.offsetHeight;
    const x = (y) => top + y / slope;

    return `polygon(${x(-bleed)}px ${-bleed}px, ${top + far}px ${-bleed}px, ${top + far}px ${h + bleed}px, ${x(h + bleed)}px ${h + bleed}px)`;
  };

  swap.classList.add("swap--active");

  // Длительности — в экранах скролла (длина закрепления считается из длины таймлайна).
  // pause — «холостой» скролл после клина и после смены экранов: картинка стоит,
  // и следующий этап не начинается сразу.
  const pause = 0.3;

  // Тряска карточки на 3 экрана скролла: толчки попеременно влево-вправо со случайным
  // размахом. Амплитуда нарастает и к концу сходит на нет, последний кадр — исходное
  // положение (наклон −2° из CSS), поэтому карточка не дёргается при отпускании.
  const card = note.querySelector(".note__card");
  const lift = swap.querySelector(".lift");
  const liftTitle = lift.querySelector(".lift__title");
  const door = lift.querySelector(".lift__door");
  const liftTexts = lift.querySelectorAll(".lift__text");
  const shakeDuration = 2;
  const shakes = 16;
  const step = shakeDuration / (shakes + 1);
  const shake = Array.from({ length: shakes }, (_, i) => {
    const amp = Math.sin((Math.PI * (i + 1)) / (shakes + 1));
    const side = i % 2 ? 1 : -1;

    const x = side * gsap.utils.random(6, 12) * amp;
    const y = gsap.utils.random(-5, 5) * amp;

    return {
      x: () => layoutPx(x),
      y: () => layoutPx(y),
      rotation: -2 + side * gsap.utils.random(1, 2.5) * amp,
      duration: step,
      ease: "sine.inOut",
    };
  });

  shake.push({ x: 0, y: 0, rotation: -2, duration: step, ease: "sine.inOut" });

  const timeline = gsap
    .timeline({ defaults: { ease: "power2.inOut" }, paused: true })
    .fromTo(
      layers,
      // диагональ начинается в правом верхнем углу — клина не видно
      { clipPath: () => shape(loud.offsetWidth + 1) },
      // диагональ ушла за левый нижний угол — экран целиком жёлтый
      {
        clipPath: () => shape(-(loud.offsetHeight + bleed) / slope - 1),
        duration: 1.5,
      },
    )
    .fromTo(
      loud,
      { xPercent: 0 },
      { xPercent: -100, duration: 1 },
      `+=${pause}`,
    )
    .fromTo(din, { xPercent: 100 }, { xPercent: 0, duration: 1 }, "<")
    // карточка въезжает слева поверх экрана 5, сам экран стоит на месте
    .fromTo(
      note,
      { xPercent: -100 },
      { xPercent: 0, duration: 1 },
      `+=${pause}`,
    )
    // карточка трясётся, пока её «пытаются проскроллить»
    .to(card, { keyframes: shake, ease: "none" })
    // красный экран «в лифте» поднимается снизу и накрывает экран 5 вместе с карточкой
    // (кадр 1 макета: заголовок и верх лифта на одной высоте, лифт крупнее)
    .fromTo(lift, { yPercent: 100 }, { yPercent: 0, duration: 1 }, `-=0.8`)
    // заголовок уезжает вверх за край, лифт встаёт по центру (кадр 2 макета)
    .fromTo(
      liftTitle,
      { y: 0 },
      { y: () => -(liftTitle.offsetTop + liftTitle.offsetHeight), duration: 1 },
      `+=${pause}`,
    )
    .fromTo(
      door,
      // масштаб от верхнего края — верх лифта ровно на уровне верха заголовка
      {
        y: () => liftTitle.offsetTop - door.offsetTop,
        scale: 551.4 / 530.2,
        transformOrigin: "50% 0",
      },
      { y: 0, scale: 1, duration: 1 },
      "<",
    )
    // тексты по бокам проявляются снизу, когда лифт почти на месте
    .fromTo(
      liftTexts,
      { autoAlpha: 0, y: () => layoutPx(30) },
      { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.3 },
      ">",
    );
  // пустой отрезок в конце: карточка стоит, пока не прокрутят pause экрана
  // .to({}, { duration: pause })

  ScrollTrigger.create({
    animation: timeline,
    trigger: swap,
    start: "top top",
    end: () => `+=${timeline.duration() * 100}%`,
    pin: true,
    scrub: 0.6,
    invalidateOnRefresh: true,
  });
})();

// Ноутбук → жёлтый экран → «улица уже кричала». Блок закрепляется, когда низ экрана
// с ноутбуком доходит до низа окна. Сначала жёлтый слой поднимается снизу вместе
// со скроллом; на доле заливки at слева и справа выезжают тексты, снизу — карточка.
// После паузы слева выезжает красный экран и закрывает жёлтый; на доле въезда at
// заголовок выезжает слева, а подпись одновременно с ним — справа.
// Появления не привязаны к скорости скролла: при пересечении порога элемент едет
// на место и плавно тормозит без перелёта (power3.out). При скролле назад он уезжает
// обратно отдельной короткой анимацией с той же кривой: стартует резко и почти
// сразу уходит из кадра, а не висит на красном, как при reverse() (обратный power3.out
// начинается с нулевой скорости). Обе анимации идут от текущего положения, поэтому
// при смене направления посреди движения элемент просто разворачивается.
(() => {
  const cover = document.querySelector(".cover");

  if (!cover || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const layer = cover.querySelector(".ask__layer");
  const left = cover.querySelector(".ask__text--left");
  const right = cover.querySelector(".ask__text--right");
  const card = cover.querySelector(".ask .note__card");
  const street = cover.querySelector(".street");
  const title = street.querySelector(".street__title");
  const text = street.querySelector(".street__text");

  cover.classList.add("cover--active");

  // Длительности — в экранах скролла. pause — «холостой» скролл между заливкой
  // и въездом красного экрана, чтобы карточку успели рассмотреть.
  const pause = 0.5;

  const timeline = gsap
    .timeline({ defaults: { ease: "none" }, paused: true })
    .fromTo(layer, { yPercent: 100 }, { yPercent: 0, duration: 1 })
    .addLabel("street", `+=${pause}`)
    .fromTo(street, { xPercent: -100 }, { xPercent: 0, duration: 1 }, "street");

  // доля этапа (0…1) по времени таймлайна
  const stages = {
    fill: (time) => time,
    street: (time) => time - timeline.labels.street,
  };

  // items — [элемент, положение за краем экрана]; функции пересчитываются при смене
  // размера окна. duration — время появления, в секундах.
  const reveals = [
    {
      stage: "fill",
      at: 0.5,
      items: [[left, { x: () => -(left.offsetLeft + left.offsetWidth) }]],
    },
    {
      stage: "fill",
      at: 0.5,
      items: [[right, { x: () => layer.offsetWidth - right.offsetLeft }]],
    },
    {
      stage: "fill",
      at: 0.5,
      duration: 0.8,
      // наклон −2° из CSS GSAP сохраняет, двигаем только по вертикали
      items: [
        [
          card,
          { y: () => (window.innerHeight + card.offsetHeight) / 2 + layoutPx(20) },
        ],
      ],
    },
    {
      stage: "street",
      at: 0.6,
      // заголовок и подпись — одновременно, с разных сторон
      items: [
        [title, { x: () => -(title.offsetLeft + title.offsetWidth) }],
        [text, { x: () => street.offsetWidth - text.offsetLeft }],
      ],
    },
  ];

  // время ухода назад, в секундах
  const exitDuration = 0.4;

  // те же свойства, что в положении за краем, но с нулями — положение на месте
  const home = (from) =>
    Object.fromEntries(Object.keys(from).map((key) => [key, 0]));

  const place = ({ items }) =>
    items.forEach(([target, from]) =>
      gsap.set(target, { ...from, overwrite: true }),
    );

  const show = ({ items, duration = 0.9 }) =>
    items.forEach(([target, from]) =>
      gsap.to(target, {
        ...home(from),
        duration,
        ease: "power3.out",
        overwrite: true,
      }),
    );

  const hide = ({ items }) =>
    items.forEach(([target, from]) =>
      gsap.to(target, {
        ...from,
        duration: exitDuration,
        ease: "power3.out",
        overwrite: true,
      }),
    );

  reveals.forEach((reveal) => {
    reveal.shown = false;
    place(reveal);
  });

  const update = ({ progress }) => {
    const time = progress * timeline.duration();

    reveals.forEach((reveal) => {
      const shown = stages[reveal.stage](time) >= reveal.at;

      if (shown === reveal.shown) return;
      reveal.shown = shown;
      (shown ? show : hide)(reveal);
    });
  };

  ScrollTrigger.create({
    animation: timeline,
    trigger: cover,
    start: "bottom bottom",
    end: () => `+=${timeline.duration() * 100}%`,
    pin: true,
    scrub: true,
    // без anticipatePin: он закрепляет на несколько px раньше, угадывая по скорости
    // скролла, а при неровной прокрутке колесом то включает, то отпускает закрепление —
    // экран с ноутбуком дёргается вверх-вниз
    invalidateOnRefresh: true,
    onUpdate: update,
    // размеры поменялись — спрятанные элементы переставляем за новые края экрана
    onRefresh: (self) => {
      reveals.forEach((reveal) => {
        if (!reveal.shown) place(reveal);
      });
      update(self);
    },
  });
})();

// Экран «В эпоху Цин…»: котёнок выезжает слева, карточка справа — одновременно,
// вместе со скроллом, в обратную сторону уезжают обратно. Секция с overflow: hidden,
// поэтому за краями экрана их не видно. Карточку двигаем через обёртку .qing__window:
// у самой карточки transform занят наклоном. При prefers-reduced-motion всё стоит на месте.
(() => {
  const qing = document.querySelector(".qing");

  if (!qing || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const cat = qing.querySelector(".qing__cat");
    const card = qing.querySelector(".qing__window");

    gsap
      .timeline({
        defaults: { ease: "power1.out", duration: 1 },
        scrollTrigger: {
          // старт — когда верх карточки показывается из-под нижнего края окна
          // (на десктопе котёнок на той же высоте), иначе к их появлению на экране
          // анимация уже почти прошла. Конец — низ секции у низа окна: дальше
          // экран закрепляется для перехода к гусям.
          trigger: card,
          start: "top bottom",
          endTrigger: qing,
          end: "clamp(bottom bottom)",
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      })
      // за левый край: на ширину самого котёнка плюс его отступ слева
      .from(cat, { x: () => -(cat.offsetLeft + cat.offsetWidth) }, 0)
      // за правый край: от левого края карточки до правого края секции
      .from(card, { x: () => qing.offsetWidth - card.offsetLeft }, 0);
  });
})();

// Переход Цин → Япония: блок закрепляется, экран с котёнком уезжает влево, экран
// с гусями одновременно въезжает справа; карточка едет вместе со своим фоном.
// Гуси стартуют дальше за правым краем и появляются позже, затем догоняют фон
// и к концу встают на место из макета. Пока летят — набирают высоту и покачиваются
// (см. fly ниже).
// Перед сменой экран с котёнком стоит закреплённым pause экрана скролла.
// Привязано к скроллу, в обратную сторону работает само.
(() => {
  const drift = document.querySelector(".drift");

  if (!drift || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const qing = drift.querySelector(".qing");
  const chindon = drift.querySelector(".chindon");
  const geese = chindon.querySelector(".chindon__geese");

  drift.classList.add("drift--active");

  // отставание гусей от фона в начале — доля ширины экрана
  const lag = 0.45;
  // покачивания за переход: вверх-вниз — один взмах
  const flaps = 3;
  // размах покачивания — доля ширины экрана, наклон на взмахе — в градусах
  const bob = 0.022;
  const tilt = 5;
  // насколько ниже своего места гуси влетают — доля высоты экрана, и наклон
  // носом вверх в начале подъёма
  const rise = 0.14;
  const climb = 3;
  // курс полёта: базовый поворот против часовой стрелки, в градусах. Покачивание
  // и наклон на взмахе отсчитываются от него
  const heading = -25;

  // Длительности — в экранах скролла (длина закрепления считается из длины таймлайна).
  // pause — «холостой» скролл перед сменой: экран с котёнком стоит на месте.
  const pause = 0.5;
  const length = 1.5;

  const timeline = gsap
    .timeline({ defaults: { ease: "power1.inOut", duration: length } })
    .fromTo(qing, { xPercent: 0 }, { xPercent: -100 }, pause)
    .fromTo(chindon, { xPercent: 100 }, { xPercent: 0 }, pause)
    // inOut: к концу отставание сокращается всё медленнее, и гуси без рывка
    // подстраиваются под скорость фона
    .fromTo(
      geese,
      { x: () => chindon.offsetWidth * lag },
      { x: 0, ease: "power2.inOut" },
      pause,
    );

  // Полёт: плавный подъём по дуге (к концу всё положе) и покачивание поверх него.
  // Гуси повёрнуты на курс heading, и покачивание идёт в их системе координат:
  // смещение — вдоль их оси «вверх», наклон — вокруг курса. Наклон следует за
  // движением: вверх — нос вверх, вниз — нос вниз. Клювы смотрят влево, поэтому нос
  // вверх — положительный угол. Курс и покачивание затухают к концу перехода, и гуси
  // встают ровно на место: смещения и поворот — нули.
  const fly = (progress) => {
    const phase = progress * flaps * Math.PI * 2;
    const fade = 1 - progress ** 3;
    const left = 1 - progress;
    const course = (heading * fade * Math.PI) / 180;
    // смещение взмаха вдоль оси «вверх» гусей, повёрнутой на курс
    const lift = bob * chindon.offsetWidth * Math.sin(phase) * fade;

    gsap.set(geese, {
      // x занят догоняющим движением, поэтому горизонтальная часть — в xPercent
      xPercent: ((lift * Math.sin(course)) / geese.offsetWidth) * 100,
      y: rise * chindon.offsetHeight * left ** 2 - lift * Math.cos(course),
      rotation: heading * fade + climb * left + tilt * Math.cos(phase) * fade,
    });
  };

  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const flight = { progress: 0 };

    timeline.fromTo(
      flight,
      { progress: 0 },
      {
        progress: 1,
        ease: "none",
        onUpdate: () => fly(flight.progress),
      },
      pause,
    );
  }

  ScrollTrigger.create({
    animation: timeline,
    trigger: drift,
    start: "top top",
    end: () => `+=${timeline.duration() * 100}%`,
    pin: true,
    scrub: true,
    invalidateOnRefresh: true,
  });
})();

// Экран «продажа через шоу»: компьютер въезжает снизу из-за края экрана вместе
// со скроллом, заголовок стоит на месте. Старт — когда место компьютера показывается
// из-под нижнего края окна, конец — низ экрана у низа окна. Компьютер поднимается
// быстрее страницы и к концу встаёт на место из макета.
// При prefers-reduced-motion стоит на месте.
(() => {
  const show = document.querySelector(".show");

  if (!show || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const computer = show.querySelector(".show__computer");

    gsap.from(computer, {
      // за нижний край экрана: от верха компьютера до низа секции
      y: () => show.offsetHeight - computer.offsetTop,
      ease: "power2.out",
      scrollTrigger: {
        trigger: computer,
        start: "top bottom",
        endTrigger: show,
        end: "clamp(bottom bottom)",
        scrub: 0.6,
        invalidateOnRefresh: true,
      },
    });
  });
})();

// Переход «продажа через шоу» → «Много — не значит плохо»: блок закрепляется, когда
// низ экрана с компьютером доходит до низа окна (компьютер к этому моменту на месте),
// и после паузы красный экран въезжает слева направо, замещая его. Привязано
// к скроллу, в обратную сторону работает само.
(() => {
  const shift = document.querySelector(".shift");

  if (!shift || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const plenty = shift.querySelector(".plenty");

  shift.classList.add("shift--active");

  // Длительности — в экранах скролла (длина закрепления считается из длины таймлайна).
  // pause — «холостой» скролл перед сменой: экран с компьютером стоит на месте.
  const pause = 0.5;

  const timeline = gsap
    .timeline()
    .fromTo(
      plenty,
      { xPercent: -100 },
      { xPercent: 0, ease: "power1.inOut", duration: 1 },
      pause,
    );

  ScrollTrigger.create({
    animation: timeline,
    trigger: shift,
    start: "bottom bottom",
    end: () => `+=${timeline.duration() * 100}%`,
    pin: true,
    scrub: true,
    invalidateOnRefresh: true,
  });
})();

// Экран «Иногда перегруженный экран…»: карточка влетает слева, как брошенный сюрикен.
// Не привязана к скорости скролла: когда место карточки показывается на экране, она
// летит по времени — быстро, вращаясь по часовой стрелке (как колесо, катящееся
// вправо), с лёгкой дугой, — замедляется и втыкается в центр с наклоном −2° из макета.
// Вращение гаснет вместе с полётом, после попадания карточка коротко дрожит.
// При скролле назад улетает обратно. При prefers-reduced-motion стоит на месте.
(() => {
  const dense = document.querySelector(".dense");

  if (!dense || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const layer = dense.querySelector(".dense__window");
    const card = layer.querySelector(".note__card");
    // наклон из CSS — на нём карточка останавливается
    const tilt = -2;
    // оборотов за полёт и длительность полёта, в секундах
    const spins = 1;
    const flight = 1.7;

    const timeline = gsap
      .timeline({
        paused: true,
        scrollTrigger: {
          trigger: card,
          start: "top 75%",
          toggleActions: "play none none reverse",
          invalidateOnRefresh: true,
        },
      })
      .fromTo(
        card,
        {
          // за левый край: плюс высота — запас на углы при вращении
          x: () => -(card.offsetLeft + card.offsetWidth + card.offsetHeight),
        },
        { x: 0, duration: flight, ease: "power3.out" },
      )
      // вращение — отдельно и мягче полёта (power2.out): в начале не так быстро,
      // гаснет к тому же моменту, когда карточка долетает
      .fromTo(
        card,
        { rotation: tilt - 360 * spins },
        { rotation: tilt, duration: flight, ease: "power2.out" },
        0,
      )
      // дуга: чуть выше линии полёта, к попаданию — на место
      .fromTo(
        card,
        { y: () => -0.06 * window.innerHeight },
        { y: 0, duration: flight, ease: "sine.out" },
        0,
      );
    // дрожь после попадания: качнулась в обе стороны и встала
    // .to(card, {
    //   keyframes: [
    //     { rotation: tilt + 2.5, duration: 0.06 },
    //     { rotation: tilt - 1.5, duration: 0.08 },
    //     { rotation: tilt + 0.8, duration: 0.08 },
    //     { rotation: tilt, duration: 0.1 },
    //   ],
    //   ease: "sine.inOut",
    // });
  });
})();

// Экран «Посмотрите снова»: «посмотрите» выезжает справа, «снова» — слева,
// одновременно, вместе со скроллом, и синхронно встают на место; в обратную сторону
// уезжают обратно. Старт — когда заголовок показывается из-под нижнего края окна,
// конец — низ экрана у низа окна. Секция с overflow: hidden, за краями строк не видно.
// При prefers-reduced-motion всё стоит на месте.
(() => {
  const again = document.querySelector(".again");

  if (!again || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    const title = again.querySelector(".again__title");
    const [first, second] = again.querySelectorAll(".again__line");

    gsap
      .timeline({
        defaults: { ease: "power1.out", duration: 1 },
        scrollTrigger: {
          trigger: title,
          start: "top bottom",
          endTrigger: again,
          end: "clamp(bottom bottom)",
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      })
      // за правый край: от левого края строки до правого края секции
      .from(
        first,
        { x: () => again.offsetWidth - (title.offsetLeft + first.offsetLeft) },
        0,
      )
      // за левый край: на ширину строки плюс её отступ слева
      .from(
        second,
        {
          x: () => -(title.offsetLeft + second.offsetLeft + second.offsetWidth),
        },
        0,
      );
  });
})();

// Переход «Посмотрите снова» → «Изменились технологии…»: блок закрепляется, когда
// низ экрана с заголовком доходит до низа окна (строки к этому моменту на месте).
// После паузы строки уезжают туда же, куда выезжали: «посмотрите» — влево,
// «снова» — вправо, а на их место снизу поднимается карточка. Привязано к скроллу,
// в обратную сторону работает само. Въезд строк двигает x, поэтому уход — через
// xPercent: анимации не мешают друг другу.
(() => {
  const outro = document.querySelector(".outro");

  if (!outro || !window.gsap || !window.ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const again = outro.querySelector(".again");
  const title = again.querySelector(".again__title");
  const [first, second] = again.querySelectorAll(".again__line");
  const stop = outro.querySelector(".stop");

  outro.classList.add("outro--active");

  // Длительности — в экранах скролла (длина закрепления считается из длины таймлайна).
  // pause — «холостой» скролл перед сменой: заголовок стоит на месте.
  // lag — на сколько позже строк стартует карточка: к её подъёму строки уже
  // разъехались и не прячутся под ней.
  const pause = 0.3;
  const lag = 0.4;

  // сдвиг строки в процентах её ширины, на который она уходит за край секции
  const beyond = (line, distance) => () =>
    (distance() / line.offsetWidth) * 100;

  const timeline = gsap
    .timeline({ defaults: { duration: 1 } })
    // за левый край: на ширину строки плюс её отступ слева
    .fromTo(
      first,
      { xPercent: 0 },
      {
        xPercent: beyond(
          first,
          () => -(title.offsetLeft + first.offsetLeft + first.offsetWidth),
        ),
        ease: "power1.inOut",
      },
      pause,
    )
    // за правый край: от левого края строки до правого края секции
    .fromTo(
      second,
      { xPercent: 0 },
      {
        xPercent: beyond(
          second,
          () => again.offsetWidth - (title.offsetLeft + second.offsetLeft),
        ),
        ease: "power1.inOut",
      },
      pause,
    )
    // карточка поднимается из-под нижнего края. Равномерно: слой высотой в окно
    // проходит своё окно за один экран скролла, то есть ровно со скоростью скролла,
    // и после открепления блока продолжает ехать вверх без стыка. С замедлением
    // в конце она почти замирала, и скролл казался подвисшим перед последним экраном.
    .fromTo(
      stop,
      { yPercent: 100 },
      { yPercent: 0, ease: "none" },
      pause + lag,
    );

  ScrollTrigger.create({
    animation: timeline,
    trigger: outro,
    start: "bottom bottom",
    end: () => `+=${timeline.duration() * 100}%`,
    pin: true,
    scrub: true,
    invalidateOnRefresh: true,
  });
})();

// Позиции триггеров считаются до загрузки шрифтов. С Inter текст переносится иначе,
// высота экранов меняется, и закрепления начинались бы не там — пересчитываем.

if (window.ScrollTrigger && document.fonts) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

// Экран 5: на мониторах живые помехи. Каждый кадр — случайные пиксели из той же палитры,
// в тех же пропорциях и в том же разрешении 96×66, что картинка из макета.
// Картинка остаётся фоном экрана: без JS и при prefers-reduced-motion видна она.
// Рисуем, только пока секция на экране.

(() => {
  const screens = document.querySelectorAll(".pc__screen");

  if (!screens.length || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;

  const width = 96;
  const height = 66;
  const frameTime = 1000 / 15;

  // [r, g, b, доля в процентах] — посчитано по screen-noise-*.png
  const palette = [
    [45, 30, 11, 45],
    [120, 100, 70, 35],
    [254, 249, 230, 17],
    [249, 231, 92, 3],
  ];

  // 100 ячеек: случайный индекс сразу даёт цвет с нужной вероятностью.
  // Цвет упакован в одно 32-битное число в порядке байт ImageData (RGBA).
  const table = new Uint32Array(100);
  const pixel = new Uint8ClampedArray(table.buffer, 0, 4);
  const word = new Uint32Array(pixel.buffer, 0, 1);
  let cell = 0;

  palette.forEach(([r, g, b, share]) => {
    pixel.set([r, g, b, 255]);
    const value = word[0];

    for (let i = 0; i < share; i += 1) table[cell++] = value;
  });

  const tvs = [...screens].map((screen) => {
    const canvas = document.createElement("canvas");

    canvas.className = "pc__noise";
    canvas.width = width;
    canvas.height = height;
    screen.append(canvas);

    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);

    return {
      screen,
      context,
      image,
      pixels: new Uint32Array(image.data.buffer),
    };
  });

  const draw = () => {
    tvs.forEach(({ screen, context, image, pixels }) => {
      // если в телевизоре уже идёт ролик, помехи под ним не рисуем
      if (screen.querySelector(".tv-video.is-playing")) return;
      for (let i = 0; i < pixels.length; i += 1)
        pixels[i] = table[(Math.random() * 100) | 0];
      context.putImageData(image, 0, 0);
    });
  };

  let frame = 0;
  let last = 0;

  const tick = (now) => {
    frame = requestAnimationFrame(tick);
    if (now - last < frameTime) return;
    last = now;
    draw();
  };

  draw();

  new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(frame);
    if (entry.isIntersecting) frame = requestAnimationFrame(tick);
  }).observe(document.querySelector(".din"));
})();

// Ролики в ретро-телевизорах. Пути — в scripts/tv-videos.js; слоты — элементы с data-tv.
// Видео без звука, по кругу, без контролов. Файл начинает грузиться, только когда секция
// подъезжает к экрану, играет — пока секция видна, иначе стоит на паузе.
// В бегущей ленте одинаковые слоты (monitor-1 в первой и во второй половине) держим
// синхронными, чтобы на стыке петли картинка в мониторе не прыгала.
// При prefers-reduced-motion ролики не запускаются — остаётся дизайн из макета.
(() => {
  const sources = window.TV_VIDEOS || {};
  const slots = [...document.querySelectorAll("[data-tv]")].filter(
    (slot) => sources[slot.dataset.tv],
  );

  if (!slots.length || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;

  // ролик — путь или список путей к одному ролику в разных форматах
  const list = (value) => [].concat(value);
  const types = {
    webm: "video/webm",
    mp4: "video/mp4",
    mov: "video/quicktime",
  };

  // в каждом телевизоре — свой ролик
  const paths = Object.values(sources)
    .filter(Boolean)
    .map((value) => list(value)[0]);
  const repeated = paths.filter((path, i) => paths.indexOf(path) !== i);

  if (repeated.length)
    console.warn(
      "tv-videos.js: один ролик указан для нескольких телевизоров:",
      [...new Set(repeated)],
    );

  const sections = new Map();

  slots.forEach((slot) => {
    const video = document.createElement("video");

    video.className = "tv-video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.disablePictureInPicture = true;
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.dataset.key = slot.dataset.tv;
    video.addEventListener("playing", () => video.classList.add("is-playing"), {
      once: true,
    });
    slot.append(video);

    const section = slot.closest("section");

    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(video);
  });

  const start = (videos) => {
    const leaders = new Map();

    videos.forEach((video) => {
      if (!video.childElementCount) {
        list(sources[video.dataset.key]).forEach((path) => {
          const source = document.createElement("source");

          source.src = path;
          source.type = types[path.split(".").pop().toLowerCase()] || "";
          video.append(source);
        });
        video.load();
      }

      const leader = leaders.get(video.dataset.key);

      if (leader) {
        // копия в ленте — подгоняем под первый экземпляр того же ролика
        const sync = () => {
          video.currentTime = leader.currentTime;
        };

        if (video.readyState > 0 && leader.readyState > 0) sync();
        else video.addEventListener("loadedmetadata", sync, { once: true });
      } else {
        leaders.set(video.dataset.key, video);
      }

      video.play().catch(() => {});
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        const videos = sections.get(target);

        if (isIntersecting) start(videos);
        else videos.forEach((video) => video.pause());
      });
    },
    { rootMargin: "200px 0px" },
  );

  sections.forEach((videos, section) => observer.observe(section));
})();
