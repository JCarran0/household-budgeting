import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Button, Group, NumberInput, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconInfoCircle } from '@tabler/icons-react';
import { ResponsiveModal } from '../ResponsiveModal';
import type { LedgerFact, LedgerFactInput, LedgerKind, LedgerSchedule } from '../../../../shared/types';
import { resolveDate } from '../../../../shared/utils/ledgerDates';
import { KIND_LABEL } from './ledgerFormat';

export type LedgerFactModalMode =
  | { type: 'create' }
  | { type: 'edit'; fact: LedgerFact }
  /** A document fact is never edited; the household records its own version, which governs (REQ-H020). */
  | { type: 'correct'; fact: LedgerFact };

interface LedgerFactModalProps {
  mode: LedgerFactModalMode | null;
  subjects: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: LedgerFactInput) => void;
}

interface FormState {
  subject: string;
  title: string;
  detail: string;
  amount: string;
  kind: LedgerKind;
  date: string | null;
  closes: string | null;
  everyCount: number;
  everyUnit: 'months' | 'years';
  until: string | null;
  leadDays: string;
}

const EMPTY: FormState = {
  subject: '', title: '', detail: '', amount: '', kind: 'deadline', date: null, closes: null,
  everyCount: 1, everyUnit: 'years', until: null, leadDays: '',
};

/** Literal dates only: the form shows the person the exact date that will be stored. */
function fromFact(f: LedgerFact): FormState {
  const s = f.schedule;
  const base: FormState = {
    ...EMPTY,
    subject: f.subject, title: f.title, detail: f.detail ?? '', amount: f.amount ?? '', kind: s.kind,
    leadDays: f.leadDays?.join(', ') ?? '',
  };
  if (s.kind === 'deadline' || s.kind === 'expiration') return { ...base, date: resolveDate(s.due) };
  if (s.kind === 'window') return { ...base, date: resolveDate(s.opens), closes: resolveDate(s.closes) };
  if (s.kind === 'recurring') {
    const unit = s.every.months ? 'months' : 'years';
    return {
      ...base, date: resolveDate(s.first), until: s.until ? resolveDate(s.until) : null,
      everyUnit: unit, everyCount: (unit === 'months' ? s.every.months : s.every.years) ?? 1,
    };
  }
  return base;
}

function toSchedule(f: FormState): LedgerSchedule | string {
  if (f.kind === 'note') return { kind: 'note' };
  if (!f.date) return 'Pick a date';
  if (f.kind === 'deadline' || f.kind === 'expiration') return { kind: f.kind, due: { date: f.date } };
  if (f.kind === 'window') {
    if (!f.closes) return 'Pick the closing date';
    if (f.closes < f.date) return 'The window cannot close before it opens';
    return { kind: 'window', opens: { date: f.date }, closes: { date: f.closes } };
  }
  if (f.everyCount < 1) return 'Repeat at least every 1';
  if (f.until && f.until < f.date) return 'The last date cannot be before the first';
  return {
    kind: 'recurring',
    first: { date: f.date },
    every: { [f.everyUnit]: f.everyCount },
    ...(f.until ? { until: { date: f.until } } : {}),
  };
}

function parseLeadDays(text: string): number[] | undefined | string {
  if (!text.trim()) return undefined;
  const values = text.split(',').map(v => Number(v.trim()));
  if (values.some(v => !Number.isInteger(v) || v < 0 || v > 730)) return 'Reminders are whole days, 0–730';
  return values.slice(0, 4);
}

export function LedgerFactModal({ mode, subjects, saving, onClose, onSubmit }: LedgerFactModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setForm(mode && mode.type !== 'create' ? fromFact(mode.fact) : EMPTY);
  }, [mode]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(f => ({ ...f, [key]: value }));

  const submit = () => {
    if (form.subject.trim().length < 2) return setError('Say what this is about (e.g. "2027 Rivian R2")');
    if (form.title.trim().length < 3) return setError('Give it a title');
    const schedule = toSchedule(form);
    if (typeof schedule === 'string') return setError(schedule);
    const leadDays = form.kind === 'note' ? undefined : parseLeadDays(form.leadDays);
    if (typeof leadDays === 'string') return setError(leadDays);
    onSubmit({
      subject: form.subject.trim(),
      title: form.title.trim(),
      ...(form.detail.trim() ? { detail: form.detail.trim() } : {}),
      ...(form.amount.trim() ? { amount: form.amount.trim() } : {}),
      schedule,
      ...(leadDays ? { leadDays } : {}),
    });
  };

  const title = mode?.type === 'edit' ? 'Edit' : mode?.type === 'correct' ? 'Correct this fact' : 'Add to the Household Ledger';
  const dated = form.kind !== 'note';

  return (
    <ResponsiveModal opened={mode !== null} onClose={onClose} title={title} size="lg">
      <Stack>
        {mode?.type === 'correct' && (
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            The document's version stays on record. Your correction is what reminders and Helper Bot use from now on;
            delete the correction to go back to the document.
          </Alert>
        )}
        <Autocomplete label="About" placeholder="2027 Rivian R2" data={subjects} value={form.subject} onChange={v => set('subject', v)} required />
        <TextInput label="Title" placeholder="Renew registration" value={form.title} onChange={e => set('title', e.currentTarget.value)} required />
        <Select
          label="Kind"
          data={(Object.keys(KIND_LABEL) as LedgerKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))}
          value={form.kind}
          onChange={v => v && set('kind', v as LedgerKind)}
          allowDeselect={false}
        />
        {dated && (
          <Group grow align="flex-start">
            <DatePickerInput
              label={form.kind === 'window' ? 'Opens' : form.kind === 'recurring' ? 'First date' : form.kind === 'expiration' ? 'Expires' : 'Due'}
              value={form.date}
              onChange={v => set('date', v)}
              valueFormat="MMM D, YYYY"
              required
            />
            {form.kind === 'window' && (
              <DatePickerInput label="Closes" value={form.closes} onChange={v => set('closes', v)} valueFormat="MMM D, YYYY" required />
            )}
            {form.kind === 'recurring' && (
              <DatePickerInput label="Last date (optional)" value={form.until} onChange={v => set('until', v)} valueFormat="MMM D, YYYY" clearable />
            )}
          </Group>
        )}
        {form.kind === 'recurring' && (
          <Group grow>
            <NumberInput label="Repeat every" min={1} max={120} value={form.everyCount} onChange={v => set('everyCount', Number(v) || 0)} />
            <Select
              label="Unit"
              data={[{ value: 'months', label: 'Months' }, { value: 'years', label: 'Years' }]}
              value={form.everyUnit}
              onChange={v => v && set('everyUnit', v as FormState['everyUnit'])}
              allowDeselect={false}
            />
          </Group>
        )}
        <TextInput label="Amount (optional)" placeholder="$50" value={form.amount} onChange={e => set('amount', e.currentTarget.value)} />
        <Textarea label="Details (optional)" autosize minRows={2} maxLength={2000} value={form.detail} onChange={e => set('detail', e.currentTarget.value)} />
        {dated && (
          <TextInput
            label="Remind me (days before)"
            description="Leave blank for the default. Separate several with commas, e.g. 30, 7"
            value={form.leadDays}
            onChange={e => set('leadDays', e.currentTarget.value)}
          />
        )}
        <Text size="xs" c="dimmed">Account and card numbers are removed automatically before saving.</Text>
        {error && <Text c="red" size="sm">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </Group>
      </Stack>
    </ResponsiveModal>
  );
}
