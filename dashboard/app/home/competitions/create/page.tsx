'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(3, {
    message: "Competition name must be at least 3 characters.",
  }),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  startDate: z.date({
    required_error: "A start date is required.",
  }),
  endDate: z.date({
    required_error: "An end date is required.",
  }).optional(),
});

export default function CreateCompetitionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      setIsLoading(true);
      // TODO: Submit to API
      console.log(values);
      router.push("/dashboard/competitions");
    } catch (error) {
      console.error("Error creating competition:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Competition</h2>
          <p className="text-muted-foreground">
            Set up a new CTF competition
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Competition Details</CardTitle>
            <CardDescription>
              Fill in the basic information about your competition
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competition Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Spring 2024 CTF" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is the name that will be displayed to participants.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter competition description..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide details about the competition, rules, and objectives.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date()
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When will the competition begin?
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date (Optional)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < (form.getValues("startDate") || new Date())
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          When will the competition end? Leave blank for no end date.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end space-x-4">
                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/competitions")}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Creating..." : "Create Competition"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
} 