import axios from "axios";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { updateUser } from "@/components/redux/common/commonSlice";
import { authService } from "@/services/auth.service";
import { useAppDispatch } from "@/stores/hooks";
import type { EmailStep } from "@/types/emailStep.types";

export const useEmailOtp = () => {
  const { t } = useTranslation();

  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [emailStep, setEmailStep] = useState<EmailStep>("input");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!email) return;

    setIsLoading(true);
    setError(null);

    try {
      await authService.sendCode(email);
      setEmailStep("code");
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;

      if (status === 429) {
        setError(t("HomePage.errors.tooManyRequests"));
      } else if (status === 400) {
        setError(t("HomePage.errors.invalidEmail"));
      } else {
        setError(t("HomePage.errors.sendCodeFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code) return;

    setIsLoading(true);
    setError(null);

    try {
      await authService.verifyCode(email, code);
      const userData = await authService.getCurrentUser();
      dispatch(updateUser(userData));
      navigate("/dashboard");
    } catch {
      setError(t("HomePage.errors.invalidOrExpiredCode"));
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setEmailStep("input");
    setCode("");
    setError(null);
  };

  return {
    emailStep,
    email,
    code,
    isLoading,
    error,
    setEmail,
    setCode,
    handleSendCode,
    handleVerifyCode,
    reset,
  };
};
