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
    const landingUrl =
      this.config.get<string>('LANDING_PAGE_LOOKMAP_URL') ||
      'https://lookmap.app';

    try {
      await this.resend.emails.send({
        from: 'LookMap <noreply@bignightcompany.com>',
        to: email,
        subject: `Tu código de verificación: ${code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #185FA5; text-align: center;">¡Bienvenido a LookMap, ${name}!</h2>
            <p style="text-align: center; color: #333; font-size: 16px;">
              Estamos felices de tenerte con nosotros. Por favor, activa tu cuenta para comenzar.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${landingUrl}/verify?email=${encodeURIComponent(email)}&code=${code}" 
                 style="background-color: #185FA5; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 18px; font-weight: bold; border-radius: 8px; display: inline-block;">
                Activar Cuenta
              </a>
            </div>

            <p style="text-align: center; color: #666; font-size: 14px;">
              Si lo prefieres, también puedes usar tu código de verificación manualmente:
            </p>

            <div style="background: #f0f7ff; border-radius: 12px; padding: 20px; text-align: center; margin: 16px 0;">
              <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #185FA5;">${code}</span>
            </div>

            <p style="color: #666; font-size: 14px; text-align: center;">
              Este enlace y código expiran en <strong>15 minutos</strong>.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px; text-align: center;">
              Si no creaste una cuenta en LookMap, ignora este correo.
            </p>
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
