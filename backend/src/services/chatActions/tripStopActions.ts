/**
 * Trip itinerary chat actions (T1)
 *
 * AI-CAPABILITY-PLATFORM-BRD §9.2, plan task 3.2. Two actions:
 *   add_trip_stop  — append an Eat / Play / Transit stop to a trip
 *   move_trip_stop — change the date (and, for a Stay, the end date) of a stop
 *
 * WHY THE MODEL CANNOT ADD A STAY:
 * TRIP-ITINERARIES-BRD REQ-009 requires a Stay to carry a VERIFIED location —
 * a Google Places record with a placeId, latitude and longitude. Those values
 * cannot be reasoned out; they are fetched. A model asked for them will produce
 * something well-formed and wrong, and a fabricated placeId does not sit inert:
 * the Map tab plots it and the photo lookup queries it. So `add_trip_stop`'s
 * type enum simply has no 'stay' member. Adding lodging stays a human action
 * performed against the real place picker.
 *
 * For the same reason, every location this action writes is `kind: 'freeText'`.
 * A free-text location renders as the label the user approved and claims
 * nothing more. There is deliberately no path here that can mint a
 * `kind: 'verified'` location, because "verified" is a claim about provenance,
 * and the provenance of a model-supplied address is the model.
 *
 * WHY MOVE IS A SEPARATE ACTION FROM ADD:
 * They fail differently. Adding a stop cannot conflict with anything; moving a
 * Stay can collide with another Stay, and that collision has to surface before
 * the batch executes rather than half-way through it (SEC-P030).
 *
 * SECURITY (SEC-A001/A002): tripId and stopId are the only identifiers the
 * model supplies, and both are resolved against family-scoped reads before any
 * row executes. familyId and userId come from the grant.
 *
 * SECURITY (SEC-A004 / REQ-P011): field rules are re-used from
 * validators/stopValidators.ts, the same schemas the HTTP routes parse.
 */

import { z } from 'zod';
import { registerChatAction } from './registry';
import { tripService } from '../index';
import { validateNoStayOverlap } from '../../shared/utils/tripHelpers';
import type { Stop, StayStop, DisplayField } from '../../shared/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD');
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time format. Use HH:mm (24-hour)');

const transitModeSchema = z.enum(['drive', 'flight', 'train', 'walk', 'shuttle', 'other']);

/**
 * Note the absent 'stay'. This is the enforcement point for the docblock above:
 * a stay cannot be expressed in these params at all, so no handler has to
 * remember to refuse one.
 */
const addStopParamsSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('eat'),
    tripId: z.string().min(1),
    date: isoDate,
    time: timeOfDay.nullable().optional(),
    notes: z.string().max(2000).optional(),
    name: z.string().min(1).max(200),
    locationLabel: z.string().min(1).max(200).optional(),
  }),
  z.object({
    type: z.literal('play'),
    tripId: z.string().min(1),
    date: isoDate,
    time: timeOfDay.nullable().optional(),
    notes: z.string().max(2000).optional(),
    name: z.string().min(1).max(200),
    locationLabel: z.string().min(1).max(200).optional(),
    durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  }),
  z.object({
    type: z.literal('transit'),
    tripId: z.string().min(1),
    date: isoDate,
    time: timeOfDay.nullable().optional(),
    notes: z.string().max(2000).optional(),
    mode: transitModeSchema,
    fromLabel: z.string().min(1).max(200).optional(),
    toLabel: z.string().min(1).max(200).optional(),
    durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  }),
]);

type AddStopParams = z.infer<typeof addStopParamsSchema>;

const moveStopParamsSchema = z
  .object({
    tripId: z.string().min(1),
    stopId: z.string().min(1),
    date: isoDate,
    /** Stays only — the LAST night (TRIP-ITINERARIES-BRD D2), not the checkout day. */
    endDate: isoDate.optional(),
    time: timeOfDay.nullable().optional(),
  })
  .refine(data => data.endDate === undefined || data.endDate >= data.date, {
    message: 'endDate must be on or after date',
    path: ['endDate'],
  });

type MoveStopParams = z.infer<typeof moveStopParamsSchema>;

function freeText(label: string | undefined): { kind: 'freeText'; label: string } | null {
  return label === undefined ? null : { kind: 'freeText', label };
}

function stopLabel(stop: Stop): string {
  return stop.type === 'transit' ? `${stop.mode} on ${stop.date}` : stop.name;
}

/** The fields move_trip_stop can change, and therefore all undo must restore. */
function movableStopFields(stop: Stop): { date: string; time: string | null; endDate?: string } {
  return stop.type === 'stay'
    ? { date: stop.date, time: stop.time, endDate: stop.endDate }
    : { date: stop.date, time: stop.time };
}

async function findStop(
  tripId: string,
  stopId: string,
  familyId: string,
): Promise<{ stop: Stop; stops: Stop[] } | null> {
  const trip = await tripService.getTrip(tripId, familyId);
  if (!trip) return null;
  const stop = trip.stops.find(s => s.id === stopId);
  return stop ? { stop, stops: trip.stops } : null;
}

registerChatAction<AddStopParams>({
  actionId: 'add_trip_stop',
  label: 'Add a stop to a trip',
  // T1 permanently. An itinerary is a user-authored plan, not metadata (SEC-P003).
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: addStopParamsSchema,

  async validateSemantics(params, ctx) {
    const trip = await tripService.getTrip(params.tripId, ctx.familyId);
    if (!trip) {
      // getTrip is family-scoped, so another household's id is indistinguishable
      // from one that never existed. That is the right amount to leak: none.
      throw new Error(`That trip no longer exists (${params.tripId}).`);
    }
  },

  /**
   * Creates have nothing to overwrite, so there is no before/after to show.
   * The card shows the proposed stop through its displayFields, which SEC-P010
   * already requires to cover every param.
   */

  undo: {
    kind: 'trip_stop',
    async capture() {
      // A create has no prior state and no id until it exists. The route fills
      // recordId in from the resource the execute returned; `before: null`
      // tells restore the record did not exist, so reversing means removing it.
      return { recordId: null, before: null };
    },
    async read(recordId, ctx) {
      // recordId is "<tripId>:<stopId>" — a stop is only addressable through
      // its trip, and undo must not have to guess which trip that was.
      const [tripId, stopId] = recordId.split(':');
      const found = await findStop(tripId, stopId, ctx.familyId);
      return found ? { ...found.stop } : null;
    },
    async restore(recordId, _before, ctx) {
      const [tripId, stopId] = recordId.split(':');
      await tripService.deleteStop(tripId, stopId, ctx.familyId, ctx.userId);
    },
  },

  async execute(params, ctx) {
    const { tripId } = params;
    const created =
      params.type === 'transit'
        ? await tripService.createStop(
            tripId,
            ctx.familyId,
            {
              type: 'transit',
              date: params.date,
              time: params.time ?? null,
              notes: params.notes,
              mode: params.mode,
              fromLocation: freeText(params.fromLabel),
              toLocation: freeText(params.toLabel),
              durationMinutes: params.durationMinutes ?? null,
            },
            ctx.userId,
          )
        : params.type === 'play'
          ? await tripService.createStop(
              tripId,
              ctx.familyId,
              {
                type: 'play',
                date: params.date,
                time: params.time ?? null,
                notes: params.notes,
                name: params.name,
                location: freeText(params.locationLabel),
                durationMinutes: params.durationMinutes ?? null,
              },
              ctx.userId,
            )
          : await tripService.createStop(
              tripId,
              ctx.familyId,
              {
                type: 'eat',
                date: params.date,
                time: params.time ?? null,
                notes: params.notes,
                name: params.name,
                location: freeText(params.locationLabel),
              },
              ctx.userId,
            );

    return {
      type: 'trip_stop',
      // Composite on purpose — see the undo.read docblock.
      id: `${tripId}:${created.id}`,
      url: `/trips/${tripId}?stopId=${created.id}`,
      label: stopLabel(created),
    };
  },
});

registerChatAction<MoveStopParams>({
  actionId: 'move_trip_stop',
  label: 'Move a stop to a different day',
  tier: 'T1',
  dataClass: 'content',
  paramsSchema: moveStopParamsSchema,

  /**
   * SEC-P030. Two resolutions, and the second is the reason this action exists
   * separately from add: moving a Stay can collide with another Stay, and
   * `tripService.updateStop` would throw mid-batch. Running the same
   * `validateNoStayOverlap` here — the shared helper, not a second copy of the
   * rule — turns that into a clean pre-execution rejection where nothing has
   * been written yet.
   */
  async validateSemantics(params, ctx) {
    const resolved = await findStop(params.tripId, params.stopId, ctx.familyId);
    if (!resolved) {
      throw new Error('That stop is no longer on this trip.');
    }

    const { stop, stops } = resolved;

    if (stop.type === 'stay') {
      if (params.endDate === undefined) {
        throw new Error(
          `Moving "${stop.name}" needs an end date — it is a stay, and the end date is its last night.`,
        );
      }
      const candidate: StayStop = { ...stop, date: params.date, endDate: params.endDate };
      const result = validateNoStayOverlap(stops, candidate, stop.id);
      if (!result.ok) {
        throw new Error(
          `That would overlap "${result.conflictsWith.name}" (${result.conflictsWith.date} – ${result.conflictsWith.endDate}).`,
        );
      }
    } else if (params.endDate !== undefined) {
      throw new Error('Only a stay has an end date.');
    }
  },

  /** SEC-P011 — where it is going is on the card; where it is now must be too. */
  async describeCurrent(params, ctx) {
    const resolved = await findStop(params.tripId, params.stopId, ctx.familyId);
    if (!resolved) return null;
    const { stop } = resolved;

    const fields: DisplayField[] = [
      { key: 'date', label: 'Currently on', value: stop.date, editable: false, type: 'date' },
    ];
    if (stop.type === 'stay') {
      fields.push({
        key: 'endDate',
        label: 'Through (last night)',
        value: stop.endDate,
        editable: false,
        type: 'date',
      });
    }
    if (params.time !== undefined) {
      fields.push({
        key: 'time',
        label: 'Current time',
        // Blank renders as absence, which reads as "not part of this change".
        value: stop.time ?? '(no time set)',
        editable: false,
        type: 'text',
      });
    }
    return fields;
  },

  undo: {
    kind: 'trip_stop',
    async capture(params, ctx) {
      const resolved = await findStop(params.tripId, params.stopId, ctx.familyId);
      if (!resolved) return null;
      return {
        recordId: `${params.tripId}:${params.stopId}`,
        before: movableStopFields(resolved.stop),
      };
    },
    async read(recordId, ctx) {
      const [tripId, stopId] = recordId.split(':');
      const resolved = await findStop(tripId, stopId, ctx.familyId);
      return resolved ? movableStopFields(resolved.stop) : null;
    },
    async restore(recordId, before, ctx) {
      const [tripId, stopId] = recordId.split(':');
      const resolved = await findStop(tripId, stopId, ctx.familyId);
      if (!resolved) return;
      const prior = before as ReturnType<typeof movableStopFields>;
      await tripService.updateStop(
        tripId,
        stopId,
        ctx.familyId,
        resolved.stop.type === 'stay'
          ? { type: 'stay', date: prior.date, time: prior.time, endDate: prior.endDate }
          : { type: resolved.stop.type, date: prior.date, time: prior.time },
        ctx.userId,
      );
    },
  },

  async execute(params, ctx) {
    const resolved = await findStop(params.tripId, params.stopId, ctx.familyId);
    if (!resolved) throw new Error('That stop is no longer on this trip.');

    const updated = await tripService.updateStop(
      params.tripId,
      params.stopId,
      ctx.familyId,
      resolved.stop.type === 'stay'
        ? {
            type: 'stay',
            date: params.date,
            endDate: params.endDate,
            ...(params.time !== undefined ? { time: params.time } : {}),
          }
        : {
            type: resolved.stop.type,
            date: params.date,
            ...(params.time !== undefined ? { time: params.time } : {}),
          },
      ctx.userId,
    );

    return {
      type: 'trip_stop',
      id: `${params.tripId}:${updated.id}`,
      url: `/trips/${params.tripId}?stopId=${updated.id}`,
      label: stopLabel(updated),
    };
  },
});
