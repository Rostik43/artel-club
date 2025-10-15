import { useState } from "react"

// иконки через CDN (мы уже подключили их в index.html)
import { Building2, Home, Phone, Hammer, Ruler, Shield, ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "./components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"

const BRAND = {
  name: "АРТЕЛЬ",
  tagline: "Архитектура • Проектирование • Строительство",
  sub: "От частных коттеджей до многоэтажных домов",
  phone: "+7 (999) 000-00-00",
  email: "info@artel.ru",
  telegram: "https://t.me/artel",
  vk: "https://vk.com/artel",
  address: "Город, ул. Примерная, 1",
}

export default function SiteArtel() {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Header — строгий, монохром, тонкие линии */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl border flex items-center justify-center">
              {/* монохромный знак — два дома тонкими линиями */}
              <div className="relative w-5 h-5">
                <div className="absolute left-0 bottom-0 w-2.5 h-2.5 border-b border-l" />
                <div className="absolute right-0 bottom-0 w-3 h-3.5 border-b border-r" />
                <div className="absolute left-[1px] -top-1 w-2.5 h-2.5 rotate-45 border-l border-t" />
                <div className="absolute right-[1px] -top-1 w-3 h-3.5 rotate-45 border-l border-t" />
              </div>
            </div>
            <span className="tracking-wider font-medium">{BRAND.name}</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#services" className="hover:opacity-70">Услуги</a>
            <a href="#projects" className="hover:opacity-70">Проекты</a>
            <a href="#process" className="hover:opacity-70">Процесс</a>
            <a href="#contacts" className="hover:opacity-70">Контакты</a>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <a href={`tel:${BRAND.phone}`} className="text-sm hover:opacity-70">{BRAND.phone}</a>
            <Button onClick={() => document.getElementById('contacts')?.scrollIntoView({behavior:'smooth'})}>Связаться</Button>
          </div>

          <button className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Открыть меню">
            <div className="w-5 h-px bg-black mb-1" />
            <div className="w-5 h-px bg-black mb-1" />
            <div className="w-5 h-px bg-black" />
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t bg-white">
            <div className="px-4 py-3 grid gap-2 text-sm">
              {["services","projects","process","contacts"].map(id=>(
                <a key={id} onClick={() => { setOpen(false); document.getElementById(id)?.scrollIntoView({behavior:'smooth'}) }}>
                  {id==="services"?"Услуги":id==="projects"?"Проекты":id==="process"?"Процесс":"Контакты"}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Hero — крупная типографика, воздух */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24 text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">{BRAND.name}</h1>
        <p className="mt-3 text-neutral-700">{BRAND.tagline}</p>
        <p className="mt-1 text-sm text-neutral-500">{BRAND.sub}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => document.getElementById('projects')?.scrollIntoView({behavior:'smooth'})}>
            Портфолио <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" onClick={() => document.getElementById('contacts')?.scrollIntoView({behavior:'smooth'})}>
            Запросить смету
          </Button>
        </div>
      </section>

      {/* Услуги — чёткая сетка, тонкие бордеры */}
      <section id="services" className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <h2 className="text-2xl md:text-3xl font-semibold">Услуги</h2>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[
              {icon: Home, t:"Архитектурная концепция", d:"Планировки, фасады, 3D-визуализации"},
              {icon: Ruler, t:"Проектирование", d:"АР, КЖ, КМ, инженерные разделы"},
              {icon: Hammer, t:"Строительство", d:"Фундамент, коробка, кровля, фасад"},
              {icon: Shield, t:"Технадзор", d:"Контроль качества и сроков"},
              {icon: Building2, t:"Многоэтажные проекты", d:"Комплексное сопровождение"},
              {icon: Phone, t:"Авторское сопровождение", d:"От идеи до ввода в эксплуатацию"},
            ].map((s,i)=>(
              <Card key={i} className="hover:shadow-sm transition">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <s.icon className="w-5 h-5"/>{s.t}
                  </CardTitle>
                </CardHeader>
                <CardContent>{s.d}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Проекты — плейсхолдеры, всё строго */}
      <section id="projects" className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl md:text-3xl font-semibold">Проекты</h2>
            <Button variant="outline">Смотреть все</Button>
          </div>
          <div className="mt-6 grid md:grid-cols-3 gap-4 md:gap-6">
            {[1,2,3].map(i=>(
              <Card key={i} className="overflow-hidden">
                <div className="aspect-[4/3] bg-neutral-100 border" />
                <CardHeader><CardTitle className="text-base">Проект #{i}</CardTitle></CardHeader>
                <CardContent>Краткое описание: площадь, материалы, статус.</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Процесс — 4 шага */}
      <section id="process" className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <h2 className="text-2xl md:text-3xl font-semibold">Процесс</h2>
          <div className="mt-6 grid md:grid-cols-4 gap-4 md:gap-6">
            {[
              {n:"01",t:"Бриф",d:"Задачи, бюджет, сроки"},
              {n:"02",t:"Концепция",d:"Планировки и 3D"},
              {n:"03",t:"Проект",d:"Рабочая документация и смета"},
              {n:"04",t:"Стройка",d:"Авторский надзор и сдача"},
            ].map(s=>(
              <div key={s.n} className="p-5 rounded-2xl border">
                <div className="text-xs text-neutral-500">Шаг {s.n}</div>
                <div className="mt-1 font-medium">{s.t}</div>
                <div className="mt-2 text-sm text-neutral-600">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Контакты */}
      <section id="contacts" className="border-t">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <h2 className="text-2xl md:text-3xl font-semibold">Контакты</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-4 md:gap-6">
            <Card><CardHeader><CardTitle className="text-base">Телефон</CardTitle></CardHeader><CardContent>{BRAND.phone}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">E-mail</CardTitle></CardHeader><CardContent>{BRAND.email}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Адрес</CardTitle></CardHeader><CardContent>{BRAND.address}</CardContent></Card>
          </div>
          <div className="mt-4 flex gap-6 text-sm">
            <a href={BRAND.vk} className="inline-flex items-center gap-1 hover:underline">VK <ExternalLink className="w-4 h-4"/></a>
            <a href={BRAND.telegram} className="inline-flex items-center gap-1 hover:underline">Telegram <ExternalLink className="w-4 h-4"/></a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-sm text-neutral-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} {BRAND.name}. Все права защищены.</div>
          <div className="flex gap-6">
            <a href={BRAND.vk} className="hover:underline">VK</a>
            <a href={BRAND.telegram} className="hover:underline">Telegram</a>
            <a href="#" className="hover:underline">Политика конфиденциальности</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
