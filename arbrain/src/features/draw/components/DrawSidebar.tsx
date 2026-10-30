'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  PenLine, Plus, Clock, MoreVertical, Star, Pencil, Trash2,
  FolderPlus, ChevronRight, FolderOpen, Folder, ArrowRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  getPages, createNewPage, deletePage, renamePage, movePageToFolder,
  getFolders, createFolder, renameFolder, deleteFolder,
} from '../services/draw-service'
import { useDrawStore } from '../stores/draw-store'
import { useLayoutStore } from '@/shared/stores/layout-store'
import { useIsMobile } from '@/shared/hooks/useMediaQuery'
import type { DrawPage, DrawFolder } from '../types'

export function DrawSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const routeBase = '/draw3'
  const activePageId = pathname.startsWith('/draw3/') ? pathname.split('/')[2] : null

  const [pages, setPages] = useState<DrawPage[]>([])
  const [folders, setFolders] = useState<DrawFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverRoot, setDragOverRoot] = useState(false)
  const [search, setSearch] = useState('')

  const favorites = useDrawStore((s) => s.favorites ?? [])
  const setLastPageId = useDrawStore((s) => s.setLastPageId)
  const toggleFavorite = useDrawStore((s) => s.toggleFavorite)

  useEffect(() => {
    async function load() {
      try {
        const [pagesData, foldersData] = await Promise.all([
          getPages('local'),
          getFolders('local').catch(() => []),
        ])
        setPages(pagesData)
        setFolders(foldersData)
        // Folders cerrados por default al abrir el canvas; solo el folder
        // de la página activa queda abierto para no perder contexto.
        const activeFolderId = activePageId
          ? pagesData.find((p) => p.page_id === activePageId)?.folder_id
          : null
        setCollapsedFolders(
          new Set(foldersData.map((f) => f.id).filter((id) => id !== activeFolderId)),
        )
      } catch (err) {
        console.error('Failed to load draw data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const sortPages = useCallback((list: DrawPage[]) => {
    return [...list].sort((a, b) => {
      const aFav = favorites.includes(a.page_id)
      const bFav = favorites.includes(b.page_id)
      if (aFav && !bFav) return -1
      if (!aFav && bFav) return 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [favorites])

  // Busqueda por nombre: filtra paginas; con query activa los folders sin
  // matches se ocultan y los que tienen matches se muestran expandidos.
  const query = search.trim().toLowerCase()
  const visiblePages = query
    ? pages.filter((p) => (p.name || '').toLowerCase().includes(query))
    : pages

  // If the folder cache is empty or stale, keep those pages visible at root.
  const knownFolderIds = new Set(folders.map((folder) => folder.id))
  const loosePages = sortPages(visiblePages.filter((p) => !p.folder_id || !knownFolderIds.has(p.folder_id)))
  const pagesByFolder = (folderId: string) =>
    sortPages(visiblePages.filter((p) => p.folder_id === folderId))
  const visibleFolders = query
    ? folders.filter((folder) => pagesByFolder(folder.id).length > 0)
    : folders

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const handleCreatePage = async (folderId: string | null = null) => {
    if (creating) return
    setCreating(true)
    try {
      const page = await createNewPage(folderId)
      const nextPage = { ...page, folder_id: folderId }
      setPages((prev) => [nextPage, ...prev])
      if (folderId) {
        setCollapsedFolders((prev) => {
          const next = new Set(prev)
          next.delete(folderId)
          return next
        })
      }
      setLastPageId(page.page_id)
      router.push(`${routeBase}/${page.page_id}`)
      // Close sidebar on mobile only
      if (window.innerWidth < 768) useLayoutStore.getState().closeDrawSidebar()
    } catch (err) {
      console.error('Failed to create page:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleCreateFolder = async () => {
    try {
      const folder = await createFolder()
      setFolders((prev) => [...prev, folder])
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  const handleDeletePage = (pageId: string) => {
    deletePage(pageId).catch(console.error)
    const remaining = pages.filter((p) => p.page_id !== pageId)
    setPages(remaining)

    if (useDrawStore.getState().lastPageId === pageId) {
      setLastPageId(null)
    }

    if (activePageId === pageId) {
      if (remaining.length > 0) {
        setLastPageId(remaining[0].page_id)
        router.push(`${routeBase}/${remaining[0].page_id}`)
      } else {
        router.push(routeBase)
      }
    }
  }

  const handleRenamePage = (pageId: string, newName: string) => {
    renamePage(pageId, newName).catch(console.error)
    setPages((prev) =>
      prev.map((p) =>
        p.page_id === pageId
          ? { ...p, name: newName, updated_at: new Date().toISOString() }
          : p,
      ),
    )
    const cache = useDrawStore.getState().cache[pageId]
    if (cache) {
      useDrawStore.getState().setPageCache(pageId, {
        ...cache,
        name: newName,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const handleMovePage = (pageId: string, folderId: string | null) => {
    movePageToFolder(pageId, folderId).catch(console.error)
    setPages((prev) =>
      prev.map((p) =>
        p.page_id === pageId ? { ...p, folder_id: folderId } : p,
      ),
    )
  }

  const handleRenameFolder = (folderId: string, newName: string) => {
    renameFolder(folderId, newName).catch(console.error)
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, name: newName } : f,
      ),
    )
  }

  const handleDeleteFolder = (folderId: string) => {
    deleteFolder(folderId).catch(console.error)
    // Pages move to root in service, reflect locally
    setPages((prev) =>
      prev.map((p) =>
        p.folder_id === folderId ? { ...p, folder_id: null } : p,
      ),
    )
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
  }

  const handleSelectPage = (page: DrawPage) => {
    setLastPageId(page.page_id)
    router.push(`${routeBase}/${page.page_id}`)
    if (window.innerWidth < 768) useLayoutStore.getState().closeDrawSidebar()
  }

  return (
    <div className="flex h-full flex-col border-r border-border-subtle bg-surface">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-3 border-b border-border-subtle">
        <span className="text-[10px] uppercase tracking-widest text-muted/80 font-semibold">
          Dibujos
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCreateFolder}
            title="Nueva carpeta"
            className="p-1 rounded-lg text-muted/80 hover:text-foreground/75 hover:bg-card-hover transition-colors"
          >
            <FolderPlus size={13} />
          </button>
          <button
            onClick={() => handleCreatePage()}
            disabled={creating}
            title="Nuevo dibujo"
            className="p-1 rounded-lg text-muted/80 hover:text-foreground/75 hover:bg-card-hover transition-colors disabled:opacity-50"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2 pt-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setSearch('') }}
          placeholder="Buscar dibujos…"
          className="w-full rounded-lg border border-border-subtle bg-card/60 px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted/60 outline-none focus:border-violet-500/40"
        />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
        {loading ? (
          <div className="space-y-1.5 px-2 py-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-card/60 animate-pulse" />
            ))}
          </div>
        ) : pages.length === 0 && folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3 py-8 text-center">
            <PenLine size={20} className="text-muted/40" />
            <p className="text-[11px] text-muted/70">Sin dibujos</p>
          </div>
        ) : (
          <>
            {/* Folders */}
            {visibleFolders.map((folder) => {
              const isCollapsed = query ? false : collapsedFolders.has(folder.id)
              const folderPages = pagesByFolder(folder.id)
              return (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  pages={folderPages}
                  isCollapsed={isCollapsed}
                  activePageId={activePageId}
                  favorites={favorites}
                  allFolders={folders}
                  isDragOver={dragOverFolderId === folder.id}
                  onToggle={() => toggleFolder(folder.id)}
                  onSelectPage={handleSelectPage}
                  onDeletePage={handleDeletePage}
                  onRenamePage={handleRenamePage}
                  onToggleFavorite={toggleFavorite}
                  onMovePage={handleMovePage}
                  onCreatePage={() => handleCreatePage(folder.id)}
                  onRenameFolder={(name) => handleRenameFolder(folder.id, name)}
                  onDeleteFolder={() => handleDeleteFolder(folder.id)}
                  onDragOver={() => setDragOverFolderId(folder.id)}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(pageId) => {
                    setDragOverFolderId(null)
                    handleMovePage(pageId, folder.id)
                  }}
                />
              )
            })}

            {/* Separator if there are both folders and loose pages */}
            {visibleFolders.length > 0 && loosePages.length > 0 && (
              <div className="h-px bg-card mx-3 my-1.5" />
            )}

            {/* Loose pages (no folder) — drop zone to move pages to root */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverRoot(true) }}
              onDragLeave={() => setDragOverRoot(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverRoot(false)
                const pageId = e.dataTransfer.getData('text/page-id')
                if (pageId) handleMovePage(pageId, null)
              }}
              className={`transition-colors rounded-lg ${dragOverRoot ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : ''}`}
            >
            {loosePages.map((page) => (
              <DrawSidebarItem
                key={page.page_id}
                page={page}
                active={activePageId === page.page_id}
                isFavorite={favorites.includes(page.page_id)}
                folders={folders}
                onSelect={() => handleSelectPage(page)}
                onDelete={() => handleDeletePage(page.page_id)}
                onToggleFavorite={() => toggleFavorite(page.page_id)}
                onRename={(name) => handleRenamePage(page.page_id, name)}
                onMoveTo={(folderId) => handleMovePage(page.page_id, folderId)}
              />
            ))}
            {/* Min-height target when empty */}
            {loosePages.length === 0 && visibleFolders.length > 0 && (
              <p className="text-[10px] text-muted/40 px-4 py-2">Arrastra aqui para sacar de carpeta</p>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Folder item ──────────────────────────────────────────────────────────────

function FolderItem({
  folder,
  pages,
  isCollapsed,
  activePageId,
  favorites,
  allFolders,
  isDragOver,
  onToggle,
  onSelectPage,
  onDeletePage,
  onRenamePage,
  onToggleFavorite,
  onMovePage,
  onCreatePage,
  onRenameFolder,
  onDeleteFolder,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  folder: DrawFolder
  pages: DrawPage[]
  isCollapsed: boolean
  activePageId: string | null
  favorites: string[]
  allFolders: DrawFolder[]
  isDragOver: boolean
  onToggle: () => void
  onSelectPage: (page: DrawPage) => void
  onDeletePage: (pageId: string) => void
  onRenamePage: (pageId: string, name: string) => void
  onToggleFavorite: (pageId: string) => void
  onMovePage: (pageId: string, folderId: string | null) => void
  onCreatePage: () => void
  onRenameFolder: (name: string) => void
  onDeleteFolder: () => void
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (pageId: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(folder.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (editing) {
      setEditValue(folder.name)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing, folder.name])

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== folder.name) onRenameFolder(trimmed)
    setEditing(false)
  }

  return (
    <div
      className="mb-0.5"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
    >
      {/* Folder header */}
      <div
        className={`group relative mx-1.5 rounded-lg transition-all
          ${isDragOver ? 'bg-violet-500/10 ring-1 ring-violet-500/30' : 'hover:bg-card'}`}
        onDragOver={(e) => { e.preventDefault(); onDragOver() }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault()
          const pageId = e.dataTransfer.getData('text/page-id')
          if (pageId) onDrop(pageId)
        }}
      >
        <div
          onClick={() => !editing && onToggle()}
          className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer pr-8"
        >
          <ChevronRight size={12} className={`text-muted/70 shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`} />
          {isCollapsed ? (
            <Folder size={13} className="text-muted/80 shrink-0" />
          ) : (
            <FolderOpen size={13} className="text-muted shrink-0" />
          )}

          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditing(false)
              }}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-card-hover border border-violet-500/40 rounded px-1.5 py-0.5 text-xs text-foreground outline-none"
            />
          ) : (
            <span className="text-xs font-medium text-muted truncate">
              {folder.name}
            </span>
          )}

          {!editing && (
            <span className="text-[9px] text-muted/60 ml-auto mr-5">{pages.length}</span>
          )}
        </div>

        {/* Folder menu */}
        {!editing && (
          <div className="absolute top-1.5 right-1.5" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
              className={`p-1 rounded transition-colors
                ${menuOpen
                  ? 'bg-card-active text-foreground/70'
                  : isMobile ? 'text-muted/80' : 'text-foreground/0 group-hover:text-muted/80 hover:!text-foreground/70 hover:bg-card-active'
                }`}
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border bg-card shadow-elevation-md overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); onCreatePage() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
                >
                  <Plus size={12} />
                  New Page
                </button>
                <div className="h-px bg-card-hover" />
                <button
                  onClick={() => { setMenuOpen(false); setEditing(true) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
                >
                  <Pencil size={12} />
                  Renombrar
                </button>
                <div className="h-px bg-card-hover" />
                <button
                  onClick={() => { setMenuOpen(false); onDeleteFolder() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                  Eliminar carpeta
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Folder contents — expansión/colapso animado (grid-rows 0fr↔1fr = altura auto smooth) */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
        <div className="overflow-hidden">
        <div className="ml-3">
          {pages.length === 0 ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCreatePage() }}
              className="mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-[10px] text-muted/55 transition-colors hover:bg-card-hover hover:text-foreground/70"
            >
              <Plus size={10} />
              New Page
            </button>
          ) : (
            pages.map((page) => (
              <DrawSidebarItem
                key={page.page_id}
                page={page}
                active={activePageId === page.page_id}
                isFavorite={favorites.includes(page.page_id)}
                folders={allFolders}
                currentFolderId={folder.id}
                onSelect={() => onSelectPage(page)}
                onDelete={() => onDeletePage(page.page_id)}
                onToggleFavorite={() => onToggleFavorite(page.page_id)}
                onRename={(name) => onRenamePage(page.page_id, name)}
                onMoveTo={(folderId) => onMovePage(page.page_id, folderId)}
              />
            ))
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar item (page) ────────────────────────────────────────────────────────

function DrawSidebarItem({
  page,
  active,
  isFavorite,
  folders,
  currentFolderId,
  onSelect,
  onDelete,
  onToggleFavorite,
  onRename,
  onMoveTo,
}: {
  page: DrawPage
  active: boolean
  isFavorite: boolean
  folders: DrawFolder[]
  currentFolderId?: string
  onSelect: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  onRename: (name: string) => void
  onMoveTo: (folderId: string | null) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(page.name)
  const [moveOpen, setMoveOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  const cachedName = useDrawStore((s) => s.cache[page.page_id]?.name)
  const displayName = cachedName || page.name

  const timeAgo = formatDistanceToNow(new Date(page.updated_at), {
    addSuffix: false,
    locale: es,
  })

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setMoveOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (editing) {
      setEditValue(displayName)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing, displayName])

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== displayName) onRename(trimmed)
    setEditing(false)
  }

  // Available folders to move to (exclude current)
  const moveTargets = folders.filter((f) => f.id !== currentFolderId)

  return (
    <div
      draggable={!editing}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen(true)
        setMoveOpen(false)
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/page-id', page.page_id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`group relative mx-1.5 rounded-lg transition-all
        ${active ? 'bg-card-active' : 'hover:bg-card'}`}
    >
      <div
        onClick={() => !editing && onSelect()}
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer pr-8"
      >
        {page.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${page.thumbnail_url}?v=${encodeURIComponent(page.updated_at)}`}
            alt=""
            loading="lazy"
            className="h-9 w-12 shrink-0 rounded-md border border-border-subtle object-cover bg-card"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-card-hover border border-violet-500/40 rounded px-1.5 py-0.5 text-xs text-foreground outline-none"
          />
        ) : (
          <p className={`text-xs font-medium leading-snug line-clamp-2 ${active ? 'text-foreground' : 'text-muted group-hover:text-foreground/75'}`}>
            {displayName}
          </p>
        )}

        {!editing && (
          <div className="flex items-center gap-1 text-[10px] text-muted/70">
            {isFavorite ? (
              <Star size={9} className="text-amber-400/70 fill-amber-400/70 shrink-0" />
            ) : (
              <Clock size={9} className="shrink-0" />
            )}
            <span className="truncate">{timeAgo}</span>
          </div>
        )}
        </div>
      </div>

      {/* Three-dot button */}
      {!editing && (
        <div className="absolute top-2 right-1.5" ref={menuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setMoveOpen(false) }}
            className={`
              p-1 rounded transition-colors
              ${menuOpen
                ? 'bg-card-active text-foreground/70'
                : 'text-foreground/0 group-hover:text-muted/80 hover:!text-foreground/70 hover:bg-card-active'
              }
            `}
            title="Opciones"
          >
            <MoreVertical size={14} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-xl border border-border bg-card shadow-elevation-md overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); onToggleFavorite() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
              >
                <Star size={12} className={isFavorite ? 'text-amber-400 fill-amber-400' : ''} />
                {isFavorite ? 'Quitar favorito' : 'Favorito'}
              </button>
              <button
                onClick={() => { setMenuOpen(false); setEditing(true) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
              >
                <Pencil size={12} />
                Renombrar
              </button>

              {/* Move to folder */}
              {(moveTargets.length > 0 || currentFolderId) && (
                <>
                  <div className="h-px bg-card-hover" />
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoveOpen((v) => !v) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground/70 hover:bg-card-hover hover:text-foreground transition-colors"
                  >
                    <ArrowRight size={12} />
                    Mover a...
                    <ChevronRight size={10} className="ml-auto" />
                  </button>
                  {moveOpen && (
                    <div className="border-t border-border-subtle bg-card">
                      {currentFolderId && (
                        <button
                          onClick={() => { setMenuOpen(false); setMoveOpen(false); onMoveTo(null) }}
                          className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] text-muted hover:bg-card-hover hover:text-foreground transition-colors"
                        >
                          <PenLine size={10} />
                          Sin carpeta
                        </button>
                      )}
                      {moveTargets.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => { setMenuOpen(false); setMoveOpen(false); onMoveTo(f.id) }}
                          className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] text-muted hover:bg-card-hover hover:text-foreground transition-colors"
                        >
                          <Folder size={10} />
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="h-px bg-card-hover" />
              <button
                onClick={() => { setMenuOpen(false); onDelete() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
