import React, { useEffect, useState, useCallback } from 'react';
import { DndContext, DragOverlay, closestCorners, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Users, GripVertical, AlertTriangle, X, Check } from 'lucide-react';
import { getPipeline, getPipelineStats, updatePipelineStage, updatePublicationDate } from '../lib/api';
import { useAppStore } from '../store';
import { formatNumber, getPlatformColor, getPlatformIcon, formatShortDate, daysUntil } from '../lib/utils';
import type { PipelineCard, PipelineStage } from '../types';
import { STAGE_LABELS, STAGE_COLORS } from '../types';

const STAGE_ORDER: PipelineStage[] = [
  'confirmed', 'waiting_brief', 'brief_sent', 'giving_feedback',
  'creating_video', 'video_overdue', 'scheduled', 'published',
];

function KanbanCard({ card, onDateClick }: { card: PipelineCard; onDateClick: (c: PipelineCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const overdue = card.is_overdue || (card.publication_date && daysUntil(card.publication_date) < 0 && card.stage !== 'published');

  return (
    <div ref={setNodeRef} style={style} className={`kanban-card mb-2 ${overdue ? 'border-red-300 bg-red-50' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${overdue ? 'text-red-700 font-bold' : 'text-slate-900'}`}>
            {card.influencer_name}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`badge text-[10px] ${getPlatformColor(card.platform)}`}>
              {getPlatformIcon(card.platform)} {card.platform}
            </span>
          </div>
        </div>
        <button {...attributes} {...listeners} className="text-slate-300 hover:text-slate-400 mt-0.5 flex-shrink-0 cursor-grab">
          <GripVertical size={14} />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{formatNumber(card.followers)}</span>
        <span className="truncate ml-1">{card.team_member_name?.split(' ')[0]}</span>
      </div>

      {overdue && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle size={11} />
          Overdue
        </div>
      )}

      <button
        onClick={() => onDateClick(card)}
        className="mt-2 w-full text-left"
      >
        {card.publication_date ? (
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${overdue ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <Calendar size={10} />
            <span>Pub: {formatShortDate(card.publication_date)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
            <Calendar size={10} />
            <span>Set date</span>
          </div>
        )}
      </button>
    </div>
  );
}

function KanbanColumn({ stage, cards, onDateClick }: { stage: PipelineStage; cards: PipelineCard[]; onDateClick: (c: PipelineCard) => void }) {
  const overdueCount = cards.filter(c => c.is_overdue || (c.publication_date && daysUntil(c.publication_date) < 0 && stage !== 'published')).length;
  return (
    <div className="kanban-column">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`badge text-[10px] ${STAGE_COLORS[stage]}`}>{STAGE_LABELS[stage]}</span>
        </div>
        <div className="flex items-center gap-1">
          {overdueCount > 0 && (
            <span className="badge bg-red-100 text-red-600 text-[10px]">{overdueCount} overdue</span>
          )}
          <span className="text-xs text-slate-400 font-medium">{cards.length}</span>
        </div>
      </div>
      <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map(card => (
          <KanbanCard key={card.id} card={card} onDateClick={onDateClick} />
        ))}
      </SortableContext>
      {cards.length === 0 && (
        <div className="text-center py-6 text-xs text-slate-300">Drop cards here</div>
      )}
    </div>
  );
}

export default function Pipeline() {
  const { activeCampaign, showToast } = useAppStore();
  const [stageData, setStageData] = useState<Record<PipelineStage, PipelineCard[]>>({} as any);
  const [stats, setStats] = useState<any[]>([]);
  const [filterMember, setFilterMember] = useState('');
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null);
  const [dateModal, setDateModal] = useState<PipelineCard | null>(null);
  const [dateInput, setDateInput] = useState('');
  const [dateToast, setDateToast] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = async () => {
    const params: Record<string, string> = {};
    if (activeCampaign) params.campaign_id = activeCampaign.id;
    if (filterMember) params.team_member_id = filterMember;
    const [p, s] = await Promise.all([
      getPipeline(params),
      getPipelineStats(activeCampaign ? { campaign_id: activeCampaign.id } : {}),
    ]);
    setStageData(p.data.cards || {});
    setStats(s.data);
  };

  useEffect(() => { load(); }, [activeCampaign, filterMember]);

  const findCardStage = (cardId: string): PipelineStage | null => {
    for (const [stage, cards] of Object.entries(stageData)) {
      if ((cards as PipelineCard[]).some(c => c.id === cardId)) return stage as PipelineStage;
    }
    return null;
  };

  const findCard = (cardId: string): PipelineCard | null => {
    for (const cards of Object.values(stageData)) {
      const c = (cards as PipelineCard[]).find(c => c.id === cardId);
      if (c) return c;
    }
    return null;
  };

  const handleDragStart = (event: any) => {
    setActiveCard(findCard(event.active.id));
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveCard(null);
    if (!over || active.id === over.id) return;

    const fromStage = findCardStage(active.id);
    const toStage = STAGE_ORDER.includes(over.id as PipelineStage)
      ? (over.id as PipelineStage)
      : findCardStage(over.id);

    if (!fromStage || !toStage || fromStage === toStage) return;

    const card = findCard(active.id);
    if (!card) return;

    setStageData(prev => {
      const next = { ...prev };
      next[fromStage] = next[fromStage].filter(c => c.id !== active.id);
      next[toStage] = [{ ...card, stage: toStage }, ...next[toStage]];
      return next;
    });

    try {
      await updatePipelineStage(active.id, toStage);
      showToast(`Moved to "${STAGE_LABELS[toStage]}"`, 'success');
    } catch {
      showToast('Failed to update stage', 'error');
      load();
    }
  };

  const handleSetDate = async () => {
    if (!dateModal || !dateInput) return;
    await updatePublicationDate(dateModal.id, dateInput);
    const formatted = new Date(dateInput).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    setDateToast(`${dateModal.influencer_name} is publishing on ${formatted}`);
    showToast(`Publication date set: ${formatted}`, 'success');
    setTimeout(() => setDateToast(''), 4000);
    setDateModal(null);
    load();
  };

  const allCards = Object.values(stageData).flat() as PipelineCard[];
  const uniqueMembers = [...new Map(allCards.map(c => [c.team_member_id, { id: c.team_member_id, name: c.team_member_name }])).values()];

  return (
    <div className="p-6 space-y-5">
      {/* Team Stats */}
      {stats.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Team Stats</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s: any) => (
              <div key={s.id} className="bg-slate-50 rounded-lg p-3">
                <div className="font-medium text-sm text-slate-800">{s.name}</div>
                <div className="mt-1.5 flex gap-4 text-xs text-slate-500">
                  <span><span className="font-semibold text-slate-700">{s.total_contacts || 0}</span> contacted</span>
                  <span><span className="font-semibold text-green-600">{s.total_confirmed || 0}</span> confirmed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter + header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{allCards.length} influencers in pipeline</div>
        <select className="select text-xs py-1.5 w-40" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
          <option value="">All Members</option>
          {uniqueMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {/* Kanban Board */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGE_ORDER.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              cards={(stageData[stage] || []).filter(c =>
                !filterMember || c.team_member_id === filterMember
              )}
              onDateClick={(c) => { setDateModal(c); setDateInput(c.publication_date || ''); }}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <div className="kanban-card w-[210px] shadow-2xl">
              <div className="font-medium text-sm text-slate-900">{activeCard.influencer_name}</div>
              <div className="text-xs text-slate-400 mt-1">{activeCard.platform}</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Date toast notification */}
      {dateToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg">
          📅 {dateToast}
        </div>
      )}

      {/* Date Modal */}
      {dateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Set Publication Date</h3>
              <button onClick={() => setDateModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5">
              <div className="text-sm text-slate-600 mb-3">
                Influencer: <span className="font-medium text-slate-900">{dateModal.influencer_name}</span>
              </div>
              <input
                type="date"
                className="input"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100">
              <button onClick={() => setDateModal(null)} className="btn-secondary">Cancel</button>
              <button onClick={handleSetDate} className="btn-primary flex items-center gap-2">
                <Check size={14} /> Save Date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
