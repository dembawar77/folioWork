import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Sauvegardes du dimanche soir (20h heure du compte) : vérifiées toutes les heures.
crons.hourly("sauvegardes hebdomadaires", { minuteUTC: 0 }, internal.backup.dispatchWeekly);

export default crons;
