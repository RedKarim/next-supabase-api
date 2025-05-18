import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

// Types
interface CreateUserRequest {
  companyCode: string;
  password: string;
  role: string;
  storeName?: string;
  group?: string;
}

interface UserProfile {
  id: string;
  company_code: string;
  role: string;
  store_name: string | null;
  group: string | null;
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
  message?: string;
  userId?: string;
  data?: UserProfile[];
}

// Helper functions
const createErrorResponse = (message: string, status: number): NextResponse => {
  return NextResponse.json({ error: message } as ErrorResponse, { status });
};

const createSuccessResponse = (data: SuccessResponse): NextResponse => {
  return NextResponse.json(data);
};

// Ensure environment variables are set
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing env.NEXT_PUBLIC_SUPABASE_URL");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing env.SUPABASE_SERVICE_ROLE_KEY");
}

// Create Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

// Route handlers
export async function POST(request: Request) {
  try {
    const { companyCode, password, role, storeName, group } =
      (await request.json()) as CreateUserRequest;

    // Validate input
    if (!companyCode || !password || !role) {
      return createErrorResponse("必須項目が不足しています", 400);
    }

    // Initialize Supabase client with cookies
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Ensure the user is authenticated
    if (!session) {
      return createErrorResponse("認証が必要です", 401);
    }

    // Check the current user's role
    const { data: currentUser, error: fetchUserError } = await supabaseAdmin
      .from("Profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (fetchUserError || !currentUser || currentUser.role !== "admin") {
      return createErrorResponse("権限がありません", 403);
    }

    // Create user in Supabase Auth
    const { data: user, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email: `${companyCode}@example.com`,
        password,
        email_confirm: true,
        user_metadata: {
          company_code: companyCode,
          role,
        },
      });

    if (createUserError || !user) {
      return createErrorResponse(
        createUserError?.message || "ユーザーの作成に失敗しました",
        400
      );
    }

    const userId = user.user.id;

    // Insert profile data
    const { error: insertError } = await supabaseAdmin.from("Profiles").insert([
      {
        id: userId,
        company_code: companyCode,
        role,
        store_name: role === "store" ? storeName : null,
        group,
      },
    ]);

    if (insertError) {
      // Rollback: Delete the user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return createErrorResponse(
        insertError.message || "プロファイルの作成に失敗しました",
        400
      );
    }

    return createSuccessResponse({
      success: true,
      message: "ユーザーを作成しました",
      userId,
    });
  } catch (error) {
    console.error("Server error:", error);
    return createErrorResponse("サーバーエラーが発生しました", 500);
  }
}

export async function GET() {
  try {
    const { data: users, error } = await supabaseAdmin
      .from("Profiles")
      .select("id, company_code, role, store_name, group");

    if (error) {
      return createErrorResponse("ユーザーの取得に失敗しました", 500);
    }

    return createSuccessResponse({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Server error:", error);
    return createErrorResponse("サーバーエラーが発生しました", 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
