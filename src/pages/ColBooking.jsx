import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../styles/tailwind.css';
import '../styles/col_booking.css';

// Collection Booking — React port of col_booking/col_booking.html.
// Behaviour, texts, capacity math and Supabase calls are kept 1:1.

const RATE = 350; const MAX_LOAD = 600;
const MNAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HRS_WD = [8, 9, 10, 11, 12, 13, 14, 15, 16]; const HRS_SAT = [8, 9, 10, 11];
const HOLIDAYS = { '2026-01-01': 'New Year', '2026-01-14': 'Nuzul Al-Quran', '2026-01-29': 'Thaipusam', '2026-02-01': 'FT Day', '2026-02-17': 'CNY', '2026-02-18': 'CNY', '2026-03-28': 'Hari Raya Aidilfitri', '2026-03-29': 'Hari Raya Aidilfitri', '2026-05-01': 'Labour Day', '2026-05-11': 'Vesak Day', '2026-06-01': 'Agong Birthday', '2026-06-04': 'Hari Raya Haji', '2026-06-05': 'Hari Raya Haji', '2026-06-25': 'Awal Muharram', '2026-08-31': 'Merdeka Day', '2026-09-03': 'Maulidur Rasul', '2026-09-16': 'Malaysia Day', '2026-10-20': 'Deepavali', '2026-12-25': 'Christmas' };
const DNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function isToday(d) { const t = new Date(); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate(); }
function isPast(d) { const t = new Date(); t.setHours(0, 0, 0, 0); const c = new Date(d); c.setHours(0, 0, 0, 0); return c < t; }
function fmtHr(h) { if (h < 12) return h + ' AM'; if (h === 12) return '12 PM'; return (h - 12) + ' PM'; }
function slotLbl(h) { return fmtHr(h) + ' – ' + fmtHr(h + 1); }
function hrsNeeded(q) { return Math.ceil(q / RATE); }
function hrLoad(q) { return q / hrsNeeded(q); }
function closing(ds) { return new Date(ds + 'T00:00:00').getDay() === 6 ? 12 : 17; }

function getHourLoad(monthBookings, ds, h) {
  let total = 0;
  monthBookings.forEach(b => {
    if ((b.booking_date || '').substring(0, 10) !== ds || b.status === 'cancelled') return;
    const s = parseInt((b.start_time || '00').split(':')[0]); let e = parseInt((b.end_time || '00').split(':')[0]);
    if (e <= s) e = s + 1;
    if (h >= s && h < e) total += hrLoad(b.collection_qty || 0);
  });
  return total;
}
function remaining(mb, ds, h) { return Math.max(0, MAX_LOAD - getHourLoad(mb, ds, h)); }

// Calculate the max qty bookable starting at startH
function maxBookableQty(mb, ds, startH) {
  const cl = closing(ds);
  let best = 0;
  for (let tryQty = 50; tryQty <= 5000; tryQty += 50) {
    const hrs = hrsNeeded(tryQty), endH = startH + hrs;
    if (endH > cl) break;
    const ld = hrLoad(tryQty); let ok = true;
    for (let h = startH; h < endH; h++) { if (getHourLoad(mb, ds, h) + ld > MAX_LOAD) { ok = false; break; } }
    if (ok) best = tryQty; else break;
  }
  return best;
}

function canFit(mb, ds, startH, qty) {
  const hrs = hrsNeeded(qty), endH = startH + hrs, cl = closing(ds);
  if (endH > cl) return false;
  const ld = hrLoad(qty);
  for (let h = startH; h < endH; h++) { if (getHourLoad(mb, ds, h) + ld > MAX_LOAD) return false; }
  return true;
}
function isDayFullyBooked(mb, ds) {
  const d = new Date(ds + 'T00:00:00'), dow = d.getDay();
  const hours = dow === 6 ? HRS_SAT : HRS_WD;
  for (let i = 0; i < hours.length; i++) { if (maxBookableQty(mb, ds, hours[i]) > 0) return false; }
  return true;
}

const W_CODES = { 0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast', 45: 'Foggy', 48: 'Fog', 51: 'Lt Drizzle', 53: 'Drizzle', 55: 'Hvy Drizzle', 61: 'Lt Rain', 63: 'Rain', 65: 'Hvy Rain', 80: 'Lt Showers', 81: 'Showers', 82: 'Hvy Showers', 95: 'T-Storm', 96: 'T-Storm+Hail', 99: 'Hvy T-Storm' };
const W_ICONS = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌧️', 55: '🌧️', 61: '🌦️', 63: '🌧️', 65: '🌧️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⚡', 96: '⚡', 99: '⚡' };

export default function ColBooking() {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [monthBookings, setMonthBookings] = useState([]);
  const [searchVal, setSearchVal] = useState('');
  const [myBookings, setMyBookings] = useState(null); // {title, rows}
  const [timeModalDate, setTimeModalDate] = useState(null);
  const [booking, setBooking] = useState(null); // {date, time, capacity}
  const [successDetail, setSuccessDetail] = useState(null);
  const [weather, setWeather] = useState(null); // {days:[...]} or null (hidden)
  const [toast, setToastMsg] = useState(null);
  const toastTimer = useRef(null);
  const headerRef = useRef(null);

  function showToast(msg) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }

  async function loadMonth(y = currentYear, m = currentMonth) {
    const f = new Date(y, m, 1), l = new Date(y, m + 1, 0);
    const { data } = await supabase.from('shared_collection_bookings')
      .select('booking_date,start_time,end_time,status,collection_qty')
      .gte('booking_date', fmtDate(f)).lte('booking_date', fmtDate(l)).neq('status', 'cancelled');
    setMonthBookings(data || []);
    return data || [];
  }

  useEffect(() => { loadMonth(); loadWeather(); return () => clearTimeout(toastTimer.current); /* eslint-disable-next-line */ }, []);

  function changeMonth(dir) {
    let m = currentMonth + dir, y = currentYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCurrentMonth(m); setCurrentYear(y);
    loadMonth(y, m);
  }

  // ── Search (order-number-exact lookup via SECURITY DEFINER RPC) ──
  async function searchMyBookings() {
    const q = String(searchVal || '').replace(/[%,*'"\\<>]/g, '').trim();
    if (q.length < 4) { showToast('Please enter your full order number (at least 4 characters)'); return; }
    const rpc = await supabase.rpc('find_my_bookings', { _order_number: q, _customer_name: null });
    if (rpc.error) { showToast('Lookup failed: ' + rpc.error.message); return; }
    let data = rpc.data || [];
    const todayStr = fmtDate(new Date());
    data = data.filter(b => (b.booking_date || '') >= todayStr);
    setMyBookings({ title: data.length ? (data[0].customer_name || q) : '—', rows: data });
  }

  // ── Weather (Open-Meteo — Miri, fixed 7-day window) ──
  async function loadWeather() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + 6);
    const fs = fmtDate(today), fe = fmtDate(end);
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=4.3995&longitude=114.0148&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Kuching&start_date=' + fs + '&end_date=' + fe);
      if (!r.ok) throw 0;
      const j = await r.json();
      if (!j.daily || !j.daily.time) throw 0;
      setWeather({ daily: j.daily, todayStr: fs });
    } catch { setWeather(null); }
  }

  // ── Decorations: firecracker burst every 45-90s (ported verbatim) ──
  useEffect(() => {
    let timer;
    function firecracker() {
      const header = headerRef.current;
      if (!header) return;
      const rect = header.getBoundingClientRect();
      const parent = header.parentElement;
      const fc = document.createElement('div');
      fc.className = 'firecracker';
      fc.style.left = (rect.width / 2) + 'px';
      fc.style.top = (rect.height / 2) + 'px';
      const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];
      for (let i = 0; i < 15; i++) {
        const s = document.createElement('div'); s.className = 'spark';
        const angle = (i / 15) * Math.PI * 2;
        const dist = 30 + Math.random() * 25;
        s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
        s.style.background = colors[Math.floor(Math.random() * colors.length)];
        s.style.boxShadow = '0 0 4px ' + s.style.background;
        fc.appendChild(s);
      }
      parent.style.position = 'relative';
      parent.appendChild(fc);
      fc.style.opacity = '1';
      setTimeout(() => fc.remove(), 1200);
    }
    function schedule() {
      const delay = 45000 + Math.random() * 45000;
      timer = setTimeout(() => { firecracker(); schedule(); }, delay);
    }
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // ── Calendar cells ──
  const firstDay = new Date(currentYear, currentMonth, 1);
  let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7;
  const cells = [];
  const cd = new Date(firstDay); cd.setDate(cd.getDate() - (startDow - 1));
  for (let r = 0; r < 6; r++) {
    let has = false;
    const row = [];
    for (let c = 0; c < 7; c++) {
      const isTM = cd.getMonth() === currentMonth, ds = fmtDate(cd), dow = cd.getDay();
      const isSun = dow === 0, hol = HOLIDAYS[ds], closed = isSun || !!hol;
      if (isTM) has = true;
      row.push({ date: new Date(cd), ds, isTM, hol, closed });
      cd.setDate(cd.getDate() + 1);
    }
    if (!has && r > 4) break;
    cells.push(...row);
  }

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-6 text-center shadow-sm overflow-hidden" style={{ position: 'relative' }}>
        <div className="mjm-title" id="mjm-title" ref={headerRef}>MJM NURSERY</div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Collection Time Slot Booking</div>
        <div className="leaf-trail" id="leaf-trail">
          <div className="floating-leaf">🌿</div>
          <div className="floating-leaf">🌱</div>
          <div className="floating-leaf">🍃</div>
        </div>
      </div>

      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        {weather && (
          <div className="dash-card p-4" id="weather-card">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-.1-9.999 5.002 5.002 0 1 0-9.78 2.096A4.001 4.001 0 0 0 3 15z" /></svg>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Miri 7-Day Weather Forecast</span>
            </div>
            <div className="weather-strip" id="weather-strip">
              {weather.daily.time.map((ds, i) => {
                const dt = new Date(ds + 'T00:00:00');
                const dl = ds === weather.todayStr ? 'Today' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
                const dd = String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
                const code = weather.daily.weather_code[i];
                const hi = Math.round(weather.daily.temperature_2m_max[i]), lo = Math.round(weather.daily.temperature_2m_min[i]);
                const rain = weather.daily.precipitation_probability_max[i] || 0;
                return (
                  <div key={ds} className={'weather-day' + (ds === weather.todayStr ? ' today' : '')}>
                    <div className="weather-day-name">{dl}</div>
                    <div style={{ fontSize: 7, color: '#cbd5e1', fontWeight: 700 }}>{dd}</div>
                    <div className="weather-day-icon">{W_ICONS[code] || '☁️'}</div>
                    <div className="weather-day-temp">{hi}°/{lo}°</div>
                    <div className={'weather-day-rain' + (rain >= 60 ? ' high' : '')}>💧{rain}%</div>
                    <div className="weather-day-desc">{W_CODES[code] || 'Cloudy'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="dash-card p-4">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">🔍 Check My Booked Time Slot</div>
          <div className="flex gap-3">
            <input id="search-input" type="text" className="search-input flex-1" placeholder="Enter your Order Number or Name..." value={searchVal} onChange={e => setSearchVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchMyBookings(); }} />
            <button onClick={searchMyBookings} className="shrink-0 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl border-none cursor-pointer transition-colors">Search</button>
          </div>
        </div>
        <div className="dash-card p-4 flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-emerald-100 flex items-center justify-center text-slate-500 hover:text-emerald-700 font-black text-lg cursor-pointer transition-colors border-none">‹</button>
          <div className="text-sm font-black text-slate-800 uppercase tracking-wide" id="month-label">{MNAMES[currentMonth]} {currentYear}</div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-emerald-100 flex items-center justify-center text-slate-500 hover:text-emerald-700 font-black text-lg cursor-pointer transition-colors border-none">›</button>
        </div>
        <div className="dash-card p-0 overflow-x-auto">
          <div id="month-grid">
            <div className="month-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="month-header">{d}</div>)}
              {cells.map((cell, i) => {
                const { date, ds, isTM, hol, closed } = cell;
                const cls = 'month-cell' + (isToday(date) ? ' today' : '') + (isPast(date) ? ' past' : '') + (!isTM ? ' other-month' : '') + (closed ? ' closed' : '') + (hol ? ' holiday' : '');
                const clickable = isTM && !closed && !isPast(date);
                return (
                  <div key={i} className={cls} onClick={clickable ? () => setTimeModalDate(ds) : undefined}>
                    <div className="month-day-num">{date.getDate()}</div>
                    {hol && <div className="month-holiday-tag">🇲🇾 {hol}</div>}
                    {clickable && (isDayFullyBooked(monthBookings, ds)
                      ? <div className="booked-tag">Fully Booked</div>
                      : <div style={{ display: 'inline-block', background: '#d1fae5', color: '#065f46', fontSize: 8, fontWeight: 900, padding: '1px 6px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '.03em', marginTop: 1 }}>Open</div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mon–Fri 8AM–5PM • Sat 8AM–12PM • Sun &amp; Holidays Closed</div>
      </div>

      {myBookings && (
        <div className="modal-overlay open" id="my-bookings-modal" onClick={e => { if (e.target === e.currentTarget) setMyBookings(null); }}>
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8)' }} className="p-6 rounded-t-[24px] flex justify-between items-start">
              <div>
                <div className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-1">📅 My Bookings</div>
                <div className="text-lg font-black text-white" id="my-bk-title">{myBookings.title}</div>
              </div>
              <button onClick={() => setMyBookings(null)} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg flex items-center justify-center transition-colors shrink-0 ml-4">×</button>
            </div>
            <div className="p-5 sm:p-6">
              <div id="my-bk-content">
                {!myBookings.rows.length ? (
                  <div className="text-center py-8"><div className="text-3xl mb-2">📋</div><div className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No bookings found for that order number</div></div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
                    <table className="my-bk-table">
                      <thead><tr><th>Date</th><th>Time</th><th>Quantity</th><th>Duration</th><th>Status</th></tr></thead>
                      <tbody>
                        {myBookings.rows.map((b, i) => {
                          const dt = b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' }) : '—';
                          const sH = parseInt((b.start_time || '08').split(':')[0]), eH = parseInt((b.end_time || '09').split(':')[0]);
                          return (
                            <tr key={i}>
                              <td>{dt}</td>
                              <td>{fmtHr(sH)} – {fmtHr(eH)}</td>
                              <td className="font-black text-emerald-700">{(parseInt(b.collection_qty) || 0).toLocaleString()}</td>
                              <td>{eH - sH} hr</td>
                              <td><span className={b.status === 'cancelled' ? 'status-cancelled' : b.status === 'pending' ? 'status-pending' : 'status-booked'}>{b.status === 'cancelled' ? 'Cancelled' : b.status === 'pending' ? 'Pending' : 'Confirmed Appointment'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="text-[10px] font-bold text-slate-400 mt-4 text-center leading-relaxed">If you need to change your booked time, please contact our MJM Nursery person in charge.</div>
            </div>
            <div className="px-5 sm:px-6 pb-6 flex justify-end border-t border-slate-100 pt-4">
              <button onClick={() => setMyBookings(null)} className="text-[10px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest bg-slate-50 px-6 py-3 rounded-full border border-slate-200 cursor-pointer transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {timeModalDate && (
        <TimeModal
          ds={timeModalDate}
          monthBookings={monthBookings}
          onClose={() => setTimeModalDate(null)}
          onPick={(ts, cap) => { setTimeModalDate(null); setBooking({ date: timeModalDate, time: ts, capacity: cap || MAX_LOAD }); }}
        />
      )}

      {booking && (
        <BookingModal
          booking={booking}
          monthBookings={monthBookings}
          showToast={showToast}
          onClose={() => setBooking(null)}
          onBack={() => { const d = booking.date; setBooking(null); setTimeModalDate(d); }}
          onBooked={async detail => {
            setBooking(null);
            setSuccessDetail(detail);
            await loadMonth();
          }}
        />
      )}

      {successDetail && (
        <div className="modal-overlay open" id="success-modal" style={{ zIndex: 260 }}>
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">✅</div>
            <div className="font-black text-slate-800 text-lg uppercase tracking-wide mb-2">Booking Confirmed!</div>
            <div className="text-sm font-bold text-slate-500 mb-1" id="success-detail">{successDetail}</div>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6 mt-4 text-left leading-relaxed">
              Thank you for booking with MJM Nursery. 🌱<br />
              We look forward to seeing you!<br />
              Please arrive on time for a smooth collection.
            </div>
            <button onClick={() => setSuccessDetail(null)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] uppercase tracking-widest rounded-xl border-none cursor-pointer transition-colors">OK</button>
          </div>
        </div>
      )}

      <div className={'toast' + (toast ? ' show' : '')} id="toast">{toast}</div>
    </>
  );
}

function TimeModal({ ds, monthBookings, onClose, onPick }) {
  const d = new Date(ds + 'T00:00:00');
  const hours = d.getDay() === 6 ? HRS_SAT : HRS_WD;
  return (
    <div className="modal-overlay open" id="time-modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }} className="p-6 rounded-t-[24px] flex justify-between items-start">
          <div>
            <div className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">⏱ Select Collection Time</div>
            <div className="text-lg font-black text-white" id="tm-date-label">{DNAMES[d.getDay()]}, {d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg flex items-center justify-center transition-colors shrink-0 ml-4">×</button>
        </div>
        <div className="p-5 sm:p-6">
          <div className="dash-card overflow-hidden border border-slate-200" id="time-slots-list">
            {hours.map(h => {
              const load = getHourLoad(monthBookings, ds, h);
              const maxQty = maxBookableQty(monthBookings, ds, h);
              const ts = String(h).padStart(2, '0') + ':00';
              if (load >= MAX_LOAD || maxQty <= 0) {
                return <div key={h} className="time-slot-row full-slot"><div className="text-sm font-black text-slate-700">{slotLbl(h)}</div><span className="slot-full">Fully Booked</span></div>;
              }
              if (load > 0) {
                const bkCount = monthBookings.filter(b => { const s = parseInt((b.start_time || '00').split(':')[0]); let e = parseInt((b.end_time || '00').split(':')[0]); if (e <= s) e = s + 1; return (b.booking_date || '').substring(0, 10) === ds && h >= s && h < e && b.status !== 'cancelled'; }).length;
                return <div key={h} className="time-slot-row" onClick={() => onPick(ts, maxQty)}><div className="text-sm font-black text-slate-700">{slotLbl(h)}</div><span className="slot-busy">{bkCount} booked • Available</span></div>;
              }
              return <div key={h} className="time-slot-row" onClick={() => onPick(ts, maxQty)}><div className="text-sm font-black text-slate-700">{slotLbl(h)}</div><span className="slot-available">✅ Available</span></div>;
            })}
          </div>
        </div>
        <div className="px-5 sm:px-6 pb-6 flex justify-end border-t border-slate-100 pt-4">
          <button onClick={onClose} className="text-[10px] font-black text-slate-500 hover:text-slate-800 uppercase tracking-widest bg-slate-50 px-6 py-3 rounded-full border border-slate-200 cursor-pointer transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function BookingModal({ booking, monthBookings, showToast, onClose, onBack, onBooked }) {
  const { date: ds, time: ts, capacity } = booking;
  const [identity, setIdentity] = useState('');
  const [identityState, setIdentityState] = useState({ valid: false, checking: false, msg: null, cls: '' });
  const [qty, setQty] = useState(0);
  const [customQty, setCustomQty] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef(null);
  const identityRef = useRef(null);

  const startH = parseInt(ts.split(':')[0]);
  const d = new Date(ds + 'T00:00:00');
  const hrs = qty > 0 ? hrsNeeded(qty) : 0;
  const endH = startH + hrs;
  const cl = closing(ds);
  const fits = qty > 0 && canFit(monthBookings, ds, startH, qty);
  const overClose = qty > 0 && endH > cl;
  const ready = qty > 0 && identityState.valid && !identityState.checking && fits;

  useEffect(() => {
    const t = setTimeout(() => identityRef.current?.focus(), 200);
    return () => { clearTimeout(t); clearTimeout(timerRef.current); };
  }, []);

  function validateIdentity(val) {
    clearTimeout(timerRef.current);
    const v = val.trim();
    if (v.length < 2) { setIdentityState({ valid: false, checking: false, msg: null, cls: '' }); return; }
    // Check if it looks like an order number (dash, slash, or letters+digits)
    const looksLikeOrder = /[-\/]/.test(v) || /^[A-Z]{1,4}[\-\s]?\d/i.test(v) || /\d{3,}/.test(v);
    if (looksLikeOrder) {
      setIdentityState({ valid: false, checking: true, msg: 'Verifying order number…', cls: 'text-slate-400' });
      timerRef.current = setTimeout(async () => {
        // Sanitise — PostgREST .or() interpolates raw, so a `,` would let the
        // user inject extra filter clauses against other columns.
        const safeVal = String(v || '').replace(/[%,*'"\\<>]/g, '');
        const { data } = await supabase.from('shared_al_orders')
          .select('al_number,customer_name,order_number')
          .or('order_number.ilike.%' + safeVal + '%,al_number.ilike.%' + safeVal + '%')
          .limit(1);
        if (data && data.length > 0) {
          setIdentityState({ valid: true, checking: false, msg: '✅ Order number verified', cls: 'text-emerald-700' });
        } else {
          setIdentityState({ valid: false, checking: false, msg: '❌ Invalid order number. Please check and enter the correct order number or use your company name instead.', cls: 'text-red-500' });
        }
      }, 600);
    } else if (v.length >= 3) {
      setIdentityState({ valid: true, checking: false, msg: '✅ Booking under: ' + v, cls: 'text-emerald-600' });
    } else {
      setIdentityState({ valid: false, checking: false, msg: null, cls: '' });
    }
  }

  async function submitBooking() {
    setSubmitting(true);
    const payload = {
      booking_date: ds, start_time: ts, end_time: String(endH).padStart(2, '0') + ':00',
      al_number: 'PENDING', customer_name: identity.trim(), order_number: identity.trim(),
      collection_qty: qty, status: 'pending',
      notes: remark.trim() || 'Customer self-booking (' + hrs + ' hr)',
    };
    const { error } = await supabase.from('shared_collection_bookings').insert([payload]);
    if (error) { showToast('❌ ' + error.message); setSubmitting(false); return; }
    onBooked(d.toLocaleDateString('en-MY', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) + ' — ' + fmtHr(startH) + ' to ' + fmtHr(endH) + ' (' + hrs + ' hr) — ' + qty.toLocaleString() + ' seedlings');
  }

  return (
    <div className="modal-overlay open" id="booking-modal" style={{ zIndex: 220 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }} className="px-6 pt-4 pb-6 rounded-t-[24px]">
          <div className="flex justify-between items-center mb-3">
            <button onClick={onBack} className="text-[9px] font-black text-emerald-800 hover:text-emerald-900 uppercase tracking-widest cursor-pointer border-none bg-white hover:bg-emerald-50 px-4 py-2 rounded-lg transition-colors shadow-sm">← Change Time</button>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-lg flex items-center justify-center transition-colors shrink-0">×</button>
          </div>
          <div className="text-[10px] font-black text-emerald-300 uppercase tracking-widest mb-1">📅 Book Collection Slot</div>
          <div className="text-sm font-bold text-emerald-300 mt-1" id="bk-slot-label">{DNAMES[d.getDay()]}, {d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })} at {fmtHr(startH)}</div>
          <div className="text-[10px] font-bold text-emerald-200 mt-1" id="bk-capacity-label">🌱 Max collection at selected time: {Math.round(capacity).toLocaleString()} seedlings</div>
        </div>
        <div className="p-5 sm:p-6 space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Order Number or Company Name *</label>
            <input ref={identityRef} id="bk-identity" type="text" className="search-input text-sm" style={{ padding: '10px 14px' }} placeholder="Your order number or company name" value={identity} onChange={e => { setIdentity(e.target.value); validateIdentity(e.target.value); }} />
            {identityState.msg && <div id="identity-status" className={'text-[10px] font-bold mt-2 ' + identityState.cls}>{identityState.msg}</div>}
          </div>
          <div>
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Collection Quantity (Seedlings) *</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {[50, 100, 500, 1000].map(q => (
                <button key={q} className={'qty-btn cq-btn' + (qty === q && !customQty ? ' active' : '')} onClick={() => { setQty(q); setCustomQty(''); }}>+{q.toLocaleString()}</button>
              ))}
              <input id="bk-custom-qty" type="number" min={1} className="search-input text-sm" style={{ padding: '10px 14px', width: 160 }} placeholder="Other quantity" value={customQty} onChange={e => { const v = parseInt(e.target.value) || 0; setCustomQty(e.target.value); setQty(v > 0 ? v : 0); }} />
            </div>
            {qty > 0 && (
              <div id="qty-label" className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Quantity: <span id="qty-value">{qty.toLocaleString()}</span> seedlings</div>
            )}
            {qty > 0 && (
              <div id="duration-info">
                <div className="est-box">
                  <div className="text-[9px] font-black text-blue-700 uppercase tracking-widest mb-1">🕑 Estimated Collection Time</div>
                  <div className="text-base font-black text-blue-900">{hrs} hour{hrs > 1 ? 's' : ''}</div>
                  <div className="text-xs font-bold text-blue-600 mt-1">{fmtHr(startH)} to {fmtHr(endH)}</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Your selected quantity of {qty.toLocaleString()} seedlings will take approximately {hrs} hour{hrs > 1 ? 's' : ''} to prepare and load.</div>
                </div>
              </div>
            )}
            {qty > 0 && overClose && (
              <div id="overflow-warn" className="text-[10px] font-bold text-red-500 mt-2">⚠️ Exceeds closing time ({fmtHr(cl)}). Reduce quantity or pick an earlier slot.</div>
            )}
            {qty > 0 && !overClose && !fits && (
              <div id="overflow-warn" className="text-[10px] font-bold text-red-500 mt-2">⚠️ Choose quantity {capacity.toLocaleString()} or below, or select another time slot.</div>
            )}
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Remark (Optional)</label>
            <input id="bk-remark" type="text" className="search-input text-sm" style={{ padding: '10px 14px' }} placeholder="Any special request or notes" value={remark} onChange={e => setRemark(e.target.value)} />
          </div>
        </div>
        <div className="px-5 sm:px-6 pb-6 flex justify-end border-t border-slate-100 pt-5">
          <button id="bk-submit" onClick={submitBooking} disabled={!ready || submitting} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-[11px] uppercase tracking-widest rounded-xl border-none cursor-pointer transition-colors">{submitting ? 'Submitting…' : '📅 Confirm Booking'}</button>
        </div>
      </div>
    </div>
  );
}
