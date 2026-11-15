import { app as fitness } from "./fitness/meta.js";
import { app as journal } from "./journal/meta.js";
import { app as lists } from "./lists/meta.js";
import { app as cookbook } from "./cookbook/meta.js";
import { app as budget } from "./budget/meta.js";
import { app as jobs } from "./jobs/meta.js";
import { app as goldenratio } from "./goldenratio/meta.js";

// Order here is only the default tile order. Build order is Isaac's call, app by app.
export const APPS = [fitness, journal, lists, cookbook, budget, jobs, goldenratio];
export const getApp = (id) => APPS.find((a) => a.id === id);
export const appsForDevice = (device) => APPS.filter((a) => a.devices.includes(device));
