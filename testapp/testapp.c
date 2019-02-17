#include <stdio.h>

int subroutine() 
{
    FILE *fp;
    int c;
    fp = fopen(__FILE__,"r");
    do {
         c = getc(fp);
         putchar(c);
    }
    while(c != EOF);
    fclose(fp);
}

int main()
{
    subroutine();
    return 0;
}