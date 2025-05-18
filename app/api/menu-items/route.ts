import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Types
interface StoreMenuItem {
  store_menu_item_id: number;
  menu_id: number;
  menu_name: string;
  price: number;
  status: boolean;
}

interface MenuCsv {
  menu_sys: string;
  menu_code: string;
}

interface TransformedMenuItem {
  id: number;
  menuId: number;
  menu_code?: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface UpdateMenuItemRequest {
  name: string;
  isActive?: boolean;
  price?: number;
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
  isActive?: boolean;
  data?: TransformedMenuItem[];
}

// Helper functions
const createErrorResponse = (message: string, status: number): NextResponse => {
  return NextResponse.json({ error: message } as ErrorResponse, { status });
};

const createSuccessResponse = (data: SuccessResponse): NextResponse => {
  return NextResponse.json(data);
};

// Route handlers
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Auth checks
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return createErrorResponse(
        "Authentication required. Please log in to continue.",
        401
      );
    }

    // Profile checks
    const { data: profile, error: profileError } = await supabase
      .from("Profiles")
      .select("company_id")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile?.company_id) {
      return createErrorResponse(
        "Store profile not found. Please contact support.",
        404
      );
    }

    if (profile.company_id === "admin") {
      return createErrorResponse(
        "Headquarters users should manage menus through the Available Menu page instead of the Menu Settings page.",
        403
      );
    }

    // Fetch menu items and menu codes
    const [{ data: menuItems }, { data: menuCsvs }] = await Promise.all([
      supabase.from("StoreItem").select("*").eq("store_id", profile.company_id),
      supabase.from("MenuCsv").select("menu_sys, menu_code"),
    ]);

    // Remove duplicates and transform
    const uniqueMenuItems = menuItems?.filter(
      (item: StoreMenuItem, index: number, self: StoreMenuItem[]) =>
        index === self.findIndex((t) => t.menu_id === item.menu_id)
    );

    const transformedItems = uniqueMenuItems?.map((item: StoreMenuItem) => ({
      id: item.store_menu_item_id,
      menuId: item.menu_id,
      menu_code: menuCsvs?.find(
        (csv: MenuCsv) => csv.menu_sys === item.menu_id.toString()
      )?.menu_code,
      name: item.menu_name,
      price: Number(item.price),
      isActive: item.status,
    }));

    return createSuccessResponse({
      success: true,
      data: transformedItems,
    });
  } catch (error) {
    console.error("Failed to fetch menu items:", error);
    return createErrorResponse(
      "An unexpected error occurred while fetching menu items",
      500
    );
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return createErrorResponse(
        "Authentication required. Please log in to continue.",
        401
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("Profiles")
      .select("company_id")
      .eq("id", session.user.id)
      .single();

    if (profileError || !profile?.company_id) {
      return createErrorResponse(
        "Store profile not found. Please contact support.",
        404
      );
    }

    if (profile.company_id === "admin") {
      return createErrorResponse(
        "Headquarters users should manage menus through the Available Menu page instead of the Menu Settings page.",
        403
      );
    }

    const body = (await request.json()) as UpdateMenuItemRequest;

    // Update the status column in StoreMenuItem table
    const { data: updateData, error: updateError } = await supabase
      .from("StoreMenuItem")
      .update({
        ...(body.isActive !== undefined && { status: !body.isActive }), // Toggle the current status
        ...(body.price !== undefined && { price: body.price }),
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", profile.company_id)
      .eq("menu_name", body.name);

    if (updateError) {
      console.error("Failed to update menu item:", updateError);
      return createErrorResponse(
        "Unable to update menu item. Please try again later.",
        500
      );
    }

    return createSuccessResponse({
      success: true,
      isActive: body.isActive !== undefined ? !body.isActive : undefined,
    });
  } catch (error) {
    console.error("Failed to process menu item update:", error);
    return createErrorResponse(
      "An unexpected error occurred while updating the menu item",
      500
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
