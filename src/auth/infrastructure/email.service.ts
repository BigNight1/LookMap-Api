import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  async sendVerificationCode(
    email: string,
    name: string,
    code: string,
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'LookMap <noreply@bignightcompany.com>',
        to: email,
        subject: `Tu código de verificación: ${code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #185FA5;">¡Bienvenido a LookMap, ${name}!</h2>
            <p>Tu código de verificación es:</p>
            <div style="background: #f0f7ff; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #185FA5;">${code}</span>
            </div>
            <p style="color: #666;">Este código expira en <strong>15 minutos</strong>.</p>
            <p style="color: #666; font-size: 12px;">Si no creaste una cuenta en LookMap, ignora este correo.</p>
          </div>
        `,
      });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (err) {
      this.logger.error(`Error sending email to ${email}:`, err);
      throw new Error('EMAIL_SEND_FAILED');
    }
  }
}
