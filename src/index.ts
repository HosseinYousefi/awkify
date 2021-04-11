import { exec, ExecException } from "child_process";
import { Telegraf, Context } from "telegraf";
import tempWrite = require("temp-write");
const LocalSession = require("telegraf-session-local");

interface SessionData {
  scripts: string[];
}

interface BotContext extends Context {
  session?: SessionData;
}

const { NODE_ENV } = process.env;

if (NODE_ENV !== "production") require("dotenv").config();

const { TELEGRAM_TOKEN } = process.env;

if (!TELEGRAM_TOKEN) {
  throw new Error("Telegram token is not defined.");
}

const bot = new Telegraf<BotContext>(TELEGRAM_TOKEN);
const localSession = new LocalSession();

bot.use(localSession.middleware());

bot.start((ctx) => {
  ctx.session ??= { scripts: [] };
  ctx.session.scripts ??= [];
  return ctx.replyWithMarkdown(`Use the command /awk to add a new awk script!`);
});

// TODO: change awk to gawk with sandbox
function awk(
  script: string,
  input: string,
  callback?: (error: ExecException, stdout: string, stderr: string) => void
) {
  // Temporary write to a file for better sandboxing.
  const scriptPath = tempWrite.sync(script);
  const inputPath = tempWrite.sync(input);
  return exec(`gawk --sandbox -f ${scriptPath} ${inputPath}`, (err, stdout, stderr) =>
    callback(err, stdout, stderr.replace(`awk: ${scriptPath}:`, ""))
  );
}

bot.command("awk", async (ctx) => {
  const script = ctx.message.text
    .replace("/awk", "")
    .replace("“", '"') // replacing the annoying quotation marks with normal ones
    .replace("”", '"');

  ctx.session ??= { scripts: [] };
  ctx.session.scripts ??= [];

  return awk(script, "", (err, _, stderr) => {
    if (err) {
      return ctx.replyWithMarkdown(
        `Error! The command was not added.\n${stderr}`
      );
    }
    ctx.session.scripts.push(script);
    return ctx.replyWithMarkdown(`Your command has been added successfully!`);
  });
});

bot.command("all", async (ctx) => {
  ctx.session ??= { scripts: [] };
  ctx.session.scripts ??= [];
  if (!ctx.session.scripts.length) {
    return ctx.replyWithMarkdown(`You currently don't have any scripts.`);
  }
  let msg = "Your scripts:\n\n";
  for (const i in ctx.session.scripts) {
    msg += `${i}. ${ctx.session.scripts[i]}\n\n`;
  }
  return ctx.replyWithMarkdown(msg);
});

bot.command("del", async (ctx) => {
  try {
    const index = parseInt(ctx.message.text.replace("/del", ""));
    if (index >= 0 && index < ctx.session.scripts.length) {
      ctx.session.scripts.splice(index, 1);
      return ctx.replyWithMarkdown(`Command ${index} deleted!`);
    }
  } catch {}
  return ctx.replyWithMarkdown(`Please enter a valid index.`);
});

bot.command("clear", async (ctx) => {
  ctx.session = { scripts: [] };
  ctx.session.scripts ??= [];
  return ctx.replyWithMarkdown(`All scripts have been cleared.`);
});

bot.on("text", async (ctx) => {
  ctx.session ??= { scripts: [] };
  ctx.session.scripts ??= [];
  if (ctx.session.scripts.length == 0) {
    return;
  }
  var awks = [];
  for (const script of ctx.session.scripts) {
    awks.push(
      awk(script, ctx.message.text, (err, stdout, _) => {
        if (!err) {
          if (stdout != "") {
            ctx.replyWithMarkdown(stdout);
          }
        }
      })
    );
  }
  return Promise.all(awks);
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
