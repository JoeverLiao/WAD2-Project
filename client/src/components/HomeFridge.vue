<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <RouterLink :to="{ name: 'fridge' }" class="fridge-link" aria-label="Open Smart Fridge">
    <svg class="fridge-art" viewBox="0 0 760 620" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient
          id="fridge-cold-light"
          x1="230"
          y1="100"
          x2="550"
          y2="540"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#ecfffd" />
          <stop offset="1" stop-color="#b1e4e2" />
        </linearGradient>
        <radialGradient id="fridge-mist">
          <stop stop-color="#f5ffff" stop-opacity=".9" />
          <stop offset="1" stop-color="#e4ffff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <g stroke="#123f3b" stroke-linecap="round" stroke-linejoin="round">
        <path
          d="M113 92C248-13 468 20 629 126c152 101 135 277 17 380-129 113-347 113-496 11C-13 407-18 210 113 92Z"
          fill="#123f3b"
          stroke-width="4"
          transform="translate(8 10)"
        />
        <path
          d="M113 92C248-13 468 20 629 126c152 101 135 277 17 380-129 113-347 113-496 11C-13 407-18 210 113 92Z"
          fill="#9ee4dc"
          stroke-width="3"
        />
        <g class="fridge-appliance">
          <!-- The cabinet stays in place while its illustrated front swings open. -->
          <path
            d="M218 88c108-19 240-16 344 9 16 143 15 307-10 451-100 17-227 11-329-8-14-143-16-301-5-452Z"
            fill="#b0d4ce"
            stroke-width="10"
          />
          <path
            d="M240 109c94-14 195-11 299 8 10 134 8 270-8 407-95 10-188 6-287-10-10-136-11-270-4-405Z"
            fill="url(#fridge-cold-light)"
            stroke-width="5"
          />
          <g class="fridge-interior" stroke-width="5">
            <path d="M244 249h295M244 369h290M246 477h284" />
            <path d="M263 152h48v79h-48Zm0 0 11-18h28l9 18m-48 29h48" fill="#fffdf0" />
            <path d="M346 210c-5-20 7-41 23-39 16-8 34 10 33 28-2 36-49 44-56 11Z" fill="#ff9587" />
            <path d="m370 175 3-21m-2 11 17-10" />
            <path d="M441 178h58l-5 53h-48Z" fill="#dff09c" />
            <path d="M269 300c24-22 54-21 76 2l-8 47h-60Z" fill="#ffe16a" />
            <path d="M400 288h100v61H400Z" fill="#fdfaf3" />
            <path d="M417 304h64m-64 15h40" stroke="#7bbeb3" />
            <path d="m282 401 22 57 22-57Z" fill="#ffb365" />
            <path d="m303 400-11-16m11 16 12-18" stroke="#3e9a8e" />
            <path d="M385 431c0-36 55-44 63-10 34-11 48 14 33 39h-91Z" fill="#81d973" />
          </g>
          <g class="fridge-door">
            <path
              d="M218 88c108-19 240-16 344 9 16 143 15 307-10 451-100 17-227 11-329-8-14-143-16-301-5-452Z"
              fill="#effffb"
              stroke-width="10"
            />
            <path d="M215 253c113-6 237-4 346 10" stroke-width="8" />
            <path d="m511 145-1 68m-2 91-2 88" stroke-width="8" />
            <path
              d="M310 296c-76-1-121 44-131 117 80 22 160 23 234 7-10-77-42-123-103-124Z"
              fill="#ffe16a"
              stroke-width="8"
              transform="translate(87 33)"
            />
            <path d="M323 376c36-23 75-20 112 4m-110 29c38 19 74 18 109 4" stroke-width="6" />
            <circle cx="314" cy="183" r="38" fill="#ff8777" stroke-width="8" />
            <path d="M300 178h1m17 0h1" stroke-width="8" />
            <path d="M301 195c11 8 22 9 31 0" stroke-width="6" />
            <path
              d="M334 254c-23-42-3-65 40-78 25 41 2 72-40 78Z"
              fill="#81d973"
              stroke-width="8"
            />
          </g>
        </g>
        <path d="m640 161 4 22m-11-4 17-10m-516 311-13 17m6-9 19 12" stroke-width="6" />
      </g>
      <g class="cold-breeze" pointer-events="none">
        <g class="mist-puff mist-one">
          <ellipse cx="492" cy="247" rx="90" ry="45" fill="url(#fridge-mist)" />
        </g>
        <g class="mist-puff mist-two">
          <ellipse cx="467" cy="350" rx="100" ry="48" fill="url(#fridge-mist)" />
        </g>
        <g class="mist-puff mist-three">
          <ellipse cx="493" cy="439" rx="85" ry="38" fill="url(#fridge-mist)" />
        </g>
        <g class="breeze-line breeze-one">
          <path d="M434 239c49-30 75 16 122-7 33-16 26-50 1-44" />
        </g>
        <g class="breeze-line breeze-two">
          <path d="M412 338c52-27 87 21 137-4 39-19 58-2 71 6" />
        </g>
        <g class="breeze-line breeze-three">
          <path d="M445 431c34-21 64 12 97-2 22-10 28-30 12-36" />
        </g>
        <g class="snowflake snowflake-one"><path d="M566 266v28m-12-21 24 14m-24 0 24-14" /></g>
        <g class="snowflake snowflake-two"><path d="M560 381v22m-10-17 20 12m-20 0 20-12" /></g>
      </g>
      <g stroke="#ff8777" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M128 155c-16 15-23 34-25 59m-16-22 16 25 24-14" />
        <path d="M639 397c21 16 33 37 34 66m-23-20 24 22 18-27" />
      </g>
    </svg>
  </RouterLink>
</template>

<style scoped>
.fridge-link {
  display: block;
  border-radius: 46%;
  -webkit-tap-highlight-color: transparent;
}
.fridge-art {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.fridge-link:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 8px;
}
.fridge-appliance {
  transform-origin: 390px 330px;
}
.fridge-door {
  transform-origin: 218px 310px;
  transform: perspective(950px) rotateY(0deg);
  transition: transform 650ms cubic-bezier(0.22, 1, 0.36, 1);
}
.fridge-link:is(:hover, :focus-visible) .fridge-appliance {
  animation: fridge-shake 450ms ease-in-out;
}
.fridge-link:is(:hover, :focus-visible) .fridge-door {
  transform: perspective(950px) rotateY(-68deg);
  transition-duration: 850ms;
  transition-delay: 320ms;
}
.mist-puff,
.breeze-line,
.snowflake {
  opacity: 0;
}
.breeze-line {
  fill: none;
  stroke: #efffff;
  stroke-width: 6;
  stroke-linecap: round;
}
.snowflake {
  fill: none;
  stroke: #e2ffff;
  stroke-width: 4;
  stroke-linecap: round;
}
.fridge-link:is(:hover, :focus-visible) .mist-puff {
  animation: cold-drift 2100ms ease-out infinite;
  animation-delay: 650ms;
}
.fridge-link:is(:hover, :focus-visible) .breeze-line {
  animation: cold-drift 1900ms ease-out infinite;
  animation-delay: 700ms;
}
.fridge-link:is(:hover, :focus-visible) .snowflake {
  animation: snow-drift 2400ms ease-out infinite;
  animation-delay: 850ms;
}
.fridge-link:is(:hover, :focus-visible) .mist-two,
.fridge-link:is(:hover, :focus-visible) .breeze-two {
  animation-delay: 1100ms;
}
.fridge-link:is(:hover, :focus-visible) .mist-three,
.fridge-link:is(:hover, :focus-visible) .breeze-three,
.fridge-link:is(:hover, :focus-visible) .snowflake-two {
  animation-delay: 1500ms;
}
@keyframes fridge-shake {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20%,
  60% {
    transform: rotate(-1.8deg);
  }
  40%,
  80% {
    transform: rotate(1.8deg);
  }
}
@keyframes cold-drift {
  0% {
    opacity: 0;
    transform: translate(0, 8px) scale(0.97);
  }
  25% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(80px, -20px) scale(1.07);
  }
}
@keyframes snow-drift {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  25% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(94px, -30px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .fridge-door {
    transition: none;
  }
  .fridge-link:is(:hover, :focus-visible) .fridge-door {
    transition: none;
    transform: perspective(950px) rotateY(-45deg);
  }
  .fridge-link:is(:hover, :focus-visible) .fridge-appliance,
  .fridge-link:is(:hover, :focus-visible) .mist-puff,
  .fridge-link:is(:hover, :focus-visible) .breeze-line,
  .fridge-link:is(:hover, :focus-visible) .snowflake {
    animation: none;
  }
}
</style>
