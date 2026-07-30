/// EmailSender concret — utilise Resend en prod, no-op en dev.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from './magic-link.service';

@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly apiKey: string | undefined;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY');
    this.fromAddress = config.get<string>('EMAIL_FROM') ?? 'no-reply@medanki.dz';
  }

  async send(args: { to: string; subject: string; html: string }): Promise<void> {
    if (!this.apiKey) {
      // Mode dev : on logge l'email au lieu de l'envoyer.
      this.logger.warn(
        `RESEND_API_KEY absent — email non envoyé. to=${args.to}, subject=${args.subject}`,
      );
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: args.to,
        subject: args.subject,
        html: args.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend a échoué (${res.status}): ${text}`);
    }
  }
}
