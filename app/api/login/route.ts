import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Types
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  companyCode: string;
  token: string;
}

interface ErrorResponse {
  error: string;
}

// Helper functions
const createErrorResponse = (message: string, status: number): NextResponse => {
  return new NextResponse(JSON.stringify({ error: message } as ErrorResponse), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

const createSuccessResponse = (data: LoginResponse): NextResponse => {
  return new NextResponse(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

// Route handlers
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { email, password } = (await request.json()) as LoginRequest;

    // Authenticate user
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError) {
      return createErrorResponse("Authentication failed", 401);
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from("Profiles")
      .select("company_code")
      .eq("id", authData.user.id)
      .single();

    if (profileError || !profile?.company_code) {
      return createErrorResponse("Company code not found", 404);
    }

    return createSuccessResponse({
      companyCode: profile.company_code,
      token: authData.session.access_token,
    });
  } catch (error) {
    console.error("Login error:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
