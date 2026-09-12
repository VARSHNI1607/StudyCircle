'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, MapPin, Search, Users, Plus, LogOut, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

type StudySession = {
  id: string
  title: string
  subject: string
  description: string | null
  session_date: string
  session_time: string
  location: string
  max_members: number
  created_by: string
  creator_name: string
  created_at: string
  member_count?: number
  joined?: boolean
}

type FormState = {
  title: string
  subject: string
  description: string
  session_date: string
  session_time: string
  location: string
  max_members: number
}

const emptyForm: FormState = {
  title: '', subject: '', description: '', session_date: '', session_time: '', location: '', max_members: 6,
}

export default function Home() {
  const [authSession, setAuthSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'today' | 'joined'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session)
      setUser(data.session?.user ?? null)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session)
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) loadSessions()
    else setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('studycircle-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, loadSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_members' }, loadSessions)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  async function loadSessions() {
    if (!user) return
    setLoading(true)
    setError('')
    const { data: rows, error: sessionError } = await supabase
      .from('study_sessions')
      .select('*')
      .gte('session_date', new Date().toISOString().slice(0, 10))
      .order('session_date', { ascending: true })
      .order('session_time', { ascending: true })

    if (sessionError) {
      setError('Could not load study sessions. Please check your connection and try again.')
      setLoading(false)
      return
    }

    const ids = (rows ?? []).map((s) => s.id)
    let memberships: { session_id: string; user_id: string }[] = []
    if (ids.length) {
      const { data } = await supabase.from('session_members').select('session_id,user_id').in('session_id', ids)
      memberships = data ?? []
    }

    const enriched = (rows ?? []).map((s) => ({
      ...s,
      member_count: memberships.filter((m) => m.session_id === s.id).length,
      joined: memberships.some((m) => m.session_id === s.id && m.user_id === user.id),
    })) as StudySession[]
    setSessions(enriched)
    setLoading(false)
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault()
    setAuthError('')
    if (!authEmail.trim() || authPassword.length < 6 || (authMode === 'signup' && !authName.trim())) {
      setAuthError(authMode === 'signup' ? 'Enter your name, valid email and a password of at least 6 characters.' : 'Enter a valid email and a password of at least 6 characters.')
      return
    }
    setAuthLoading(true)
    if (authMode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { data: { full_name: authName.trim() } },
      })
      if (error) setAuthError(error.message)
      else setAuthError('Account created. If email confirmation is enabled, confirm your email and then sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      if (error) setAuthError(error.message)
    }
    setAuthLoading(false)
  }

  async function saveSession(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setFormError('')
    if (!form.title.trim() || !form.subject.trim() || !form.session_date || !form.session_time || !form.location.trim()) {
      setFormError('Please fill all required fields.')
      return
    }
    if (form.max_members < 2 || form.max_members > 30) {
      setFormError('Group size must be between 2 and 30.')
      return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(), subject: form.subject.trim(), description: form.description.trim() || null,
      session_date: form.session_date, session_time: form.session_time, location: form.location.trim(),
      max_members: form.max_members, created_by: user.id,
      creator_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Student',
    }
    let dbError
    if (editingId) {
      const res = await supabase.from('study_sessions').update(payload).eq('id', editingId)
      dbError = res.error
    } else {
      const res = await supabase.from('study_sessions').insert(payload).select('id').single()
      dbError = res.error
      if (!res.error && res.data) {
        await supabase.from('session_members').insert({ session_id: res.data.id, user_id: user.id })
      }
    }
    setSaving(false)
    if (dbError) { setFormError(dbError.message); return }
    closeForm()
    loadSessions()
  }

  async function joinOrLeave(s: StudySession) {
    if (!user) return
    setError('')
    if (s.joined) {
      const { error } = await supabase.from('session_members').delete().eq('session_id', s.id).eq('user_id', user.id)
      if (error) setError(error.message)
    } else {
      if ((s.member_count ?? 0) >= s.max_members) { setError('This study circle is already full.'); return }
      const { error } = await supabase.from('session_members').insert({ session_id: s.id, user_id: user.id })
      if (error) setError(error.message)
    }
    loadSessions()
  }

  function startEdit(s: StudySession) {
    setEditingId(s.id)
    setForm({
      title: s.title, subject: s.subject, description: s.description ?? '', session_date: s.session_date,
      session_time: s.session_time.slice(0,5), location: s.location, max_members: s.max_members,
    })
    setShowForm(true)
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this study session?')) return
    const { error } = await supabase.from('study_sessions').delete().eq('id', id)
    if (error) setError(error.message)
    else loadSessions()
  }

  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setFormError('')
  }

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return sessions.filter((s) => {
      const q = query.toLowerCase()
      const textMatch = s.title.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q) || s.location.toLowerCase().includes(q)
      const filterMatch = filter === 'all' || (filter === 'today' && s.session_date === today) || (filter === 'joined' && s.joined)
      return textMatch && filterMatch
    })
  }, [sessions, query, filter])

  if (!authSession) {
    return (
      <main className="auth-page">
        <section className="auth-brand">
          <div className="brand-mark">SC</div>
          <p className="eyebrow">COLLEGE STUDY MEETUPS</p>
          <h1>Find your circle.<br />Study better together.</h1>
          <p className="brand-copy">Create small in-person study meetups on campus, discover sessions around you and reserve a spot.</p>
          <div className="mini-card"><Users size={20}/><span>Real people. Real meetups. Shared progress.</span></div>
        </section>
        <section className="auth-card">
          <div className="auth-tabs">
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
            <button className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Create account</button>
          </div>
          <h2>{authMode === 'login' ? 'Welcome back' : 'Join StudyCircle'}</h2>
          <p>{authMode === 'login' ? 'Sign in to discover your next study meetup.' : 'Create a student account in a few seconds.'}</p>
          <form onSubmit={handleAuth}>
            {authMode === 'signup' && <label>Name<input value={authName} onChange={(e)=>setAuthName(e.target.value)} placeholder="Your name" /></label>}
            <label>Email<input type="email" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" value={authPassword} onChange={(e)=>setAuthPassword(e.target.value)} placeholder="At least 6 characters" /></label>
            {authError && <div className={authError.startsWith('Account created') ? 'success-box' : 'error-box'}>{authError}</div>}
            <button className="primary full" disabled={authLoading}>{authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main>
      <header className="topbar">
        <div className="logo-wrap"><div className="brand-mark small">SC</div><div><strong>StudyCircle</strong><span>Campus study meetups</span></div></div>
        <div className="user-actions"><span className="user-email">{user?.user_metadata?.full_name || user?.email}</span><button className="icon-btn" title="Sign out" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/></button></div>
      </header>

      <section className="hero container">
        <div><p className="eyebrow">STUDY TOGETHER, OFFLINE</p><h1>What are you studying today?</h1><p>Discover small in-person study circles around campus or create one of your own.</p></div>
        <button className="primary" onClick={()=>setShowForm(true)}><Plus size={18}/> Create session</button>
      </section>

      <section className="controls container">
        <div className="search"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search subject, topic or location..." /></div>
        <div className="filters">
          {(['all','today','joined'] as const).map(f => <button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='all'?'All sessions':f==='today'?'Today':'Joined by me'}</button>)}
        </div>
      </section>

      <section className="container content">
        {error && <div className="error-box row-error">{error}<button onClick={()=>setError('')}>×</button></div>}
        {loading ? (
          <div className="grid">{[1,2,3].map(i=><div key={i} className="card skeleton"><div/><div/><div/><div/></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon"><Users size={28}/></div><h3>No study circles found</h3><p>{query || filter!=='all' ? 'Try changing your search or filter.' : 'Be the first to create a study meetup.'}</p><button className="primary" onClick={()=>setShowForm(true)}><Plus size={18}/> Create session</button></div>
        ) : (
          <div className="grid">
            {filtered.map(s => {
              const full = (s.member_count ?? 0) >= s.max_members
              const own = s.created_by === user?.id
              return <article className="card" key={s.id}>
                <div className="card-head"><span className="subject-pill">{s.subject}</span>{own && <div className="owner-actions"><button onClick={()=>startEdit(s)}><Pencil size={15}/></button><button onClick={()=>deleteSession(s.id)}><Trash2 size={15}/></button></div>}</div>
                <h3>{s.title}</h3>
                <p className="description">{s.description || 'A focused study meetup for students working on this topic.'}</p>
                <div className="meta"><span><CalendarDays size={16}/>{new Date(s.session_date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</span><span><Clock3 size={16}/>{s.session_time.slice(0,5)}</span><span><MapPin size={16}/>{s.location}</span></div>
                <div className="card-footer"><div className="members"><div className="avatar">{s.creator_name.charAt(0).toUpperCase()}</div><div><strong>{s.member_count ?? 0}/{s.max_members} joined</strong><span>by {s.creator_name}</span></div></div><button className={s.joined?'secondary':'primary'} disabled={!s.joined && full} onClick={()=>joinOrLeave(s)}>{s.joined?'Leave':full?'Full':'I’m in'}</button></div>
              </article>
            })}
          </div>
        )}
      </section>

      {showForm && <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)closeForm()}}><div className="modal"><div className="modal-head"><div><p className="eyebrow">{editingId?'UPDATE MEETUP':'NEW MEETUP'}</p><h2>{editingId?'Edit study session':'Create a study session'}</h2></div><button className="icon-btn" onClick={closeForm}><X size={20}/></button></div><form onSubmit={saveSession} className="session-form"><div className="two"><label>Title *<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="DSA revision" /></label><label>Subject *<input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Data Structures" /></label></div><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What are you planning to cover?" /></label><div className="two"><label>Date *<input type="date" min={new Date().toISOString().slice(0,10)} value={form.session_date} onChange={e=>setForm({...form,session_date:e.target.value})}/></label><label>Time *<input type="time" value={form.session_time} onChange={e=>setForm({...form,session_time:e.target.value})}/></label></div><div className="two"><label>Campus location *<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Main Library" /></label><label>Maximum members *<input type="number" min="2" max="30" value={form.max_members} onChange={e=>setForm({...form,max_members:Number(e.target.value)})}/></label></div>{formError&&<div className="error-box">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={closeForm}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving...':editingId?'Save changes':'Create session'}</button></div></form></div></div>}
    </main>
  )
}
