// Local-dev email: no SMTP. Links are written to the server console so the
// password-reset and confirm flows are testable without a mailbox. Swap the
// body of sendMail() for a real provider (Resend, nodemailer, SES) to ship.

type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail): Promise<void> {
  const provider = process.env.MAIL_PROVIDER ?? "console";
  if (provider === "console") {
    console.log(
      `\n──────── email ────────\nto:      ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n───────────────────────\n`
    );
    return;
  }
  throw new Error(`MAIL_PROVIDER "${provider}" not implemented`);
}

export function passwordResetMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Reset your password",
    text: `Open this link to choose a new password (valid for 1 hour):\n\n${link}\n`,
  };
}

export function confirmEmailMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Confirm your email",
    text: `Confirm your address to finish setting up your account:\n\n${link}\n`,
  };
}
